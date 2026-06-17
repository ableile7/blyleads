import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from './stripe'

// Supabase caps every select at 1000 rows regardless of .limit(), so paginate.
export async function fetchAvailableLeadIds(
  supabase: SupabaseClient,
  tier: string,
  states: string[] | null,
  quantity: number
): Promise<string[]> {
  const ids: string[] = []
  let page = 0
  while (ids.length < quantity) {
    let query = supabase
      .from('leads')
      .select('id')
      .eq('tier', tier)
      .eq('is_sold', false)
      .order('id')
      .range(page * 1000, page * 1000 + 999)
    if (states && states.length > 0) query = query.in('state', states)

    const { data, error } = await query
    if (error || !data || data.length === 0) break
    ids.push(...data.map((l: { id: string }) => l.id))
    if (data.length < 1000) break
    page++
  }
  return ids.slice(0, quantity)
}

// .in('id', ids) puts every UUID in the request URL; large orders exceed URL
// limits and the update fails. Chunk to stay safely under.
export async function markLeadsSold(
  supabase: SupabaseClient,
  leadIds: string[],
  agentId: string,
  soldAt: string,
  orderId: string
): Promise<{ message: string } | null> {
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200)
    const { error } = await supabase
      .from('leads')
      // order_id links each lead to the specific order it was sold for, so the
      // download can return exactly that order's leads (instead of guessing by
      // "newest N of this tier", which misfires for repeat same-tier buyers).
      .update({ is_sold: true, sold_to: agentId, sold_at: soldAt, order_id: orderId })
      .in('id', chunk)
    if (error) return error
  }
  return null
}

export type FulfillResult = {
  // Whether Stripe confirmed this session is actually paid.
  sessionPaid: boolean
  // Orders this call assigned leads for.
  fulfilled: number
  // Orders another concurrent trigger already claimed (webhook vs success page).
  alreadyDone: number
  // Human-readable reasons orders couldn't be fulfilled (e.g. not enough leads).
  failed: string[]
}

// The single source of truth for fulfilling an order. Verifies payment with
// Stripe, then for every still-pending order in the session: atomically claims
// it (pending -> paid) so concurrent triggers can't double-assign, assigns the
// leads, and syncs the tier's available_count. Idempotent and safe to call from
// the Stripe webhook, the agent's success page, and the admin Fulfill button.
export async function fulfillPaidSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<FulfillResult> {
  const result: FulfillResult = { sessionPaid: false, fulfilled: 0, alreadyDone: 0, failed: [] }
  if (!sessionId) return result

  // Stripe is the source of truth for payment — never fulfill an unpaid session.
  let session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return result
  }
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return result
  }
  result.sessionPaid = true
  const paymentIntent = (session.payment_intent as string) || null

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('stripe_session_id', sessionId)
    .eq('status', 'pending')

  if (!orders || orders.length === 0) return result

  const now = new Date().toISOString()

  for (const order of orders) {
    // Atomically claim the order. The .eq('status','pending') guard means only
    // one trigger wins; a concurrent caller gets an empty result and skips.
    const { data: claimed } = await supabase
      .from('orders')
      .update({ status: 'paid', stripe_payment_intent: paymentIntent })
      .eq('id', order.id)
      .eq('status', 'pending')
      .select('id')

    if (!claimed || claimed.length === 0) {
      result.alreadyDone++
      continue
    }

    const leadIds = await fetchAvailableLeadIds(supabase, order.tier, order.states, order.quantity)
    if (leadIds.length < order.quantity) {
      // Not enough inventory — release the claim so it can be retried/fulfilled later.
      await supabase.from('orders').update({ status: 'pending', stripe_payment_intent: null }).eq('id', order.id)
      result.failed.push(`${order.tier}: only ${leadIds.length} of ${order.quantity} leads available`)
      continue
    }

    const assignError = await markLeadsSold(supabase, leadIds, order.agent_id, now, order.id)
    if (assignError) {
      await supabase.from('orders').update({ status: 'pending', stripe_payment_intent: null }).eq('id', order.id)
      result.failed.push(`${order.tier}: ${assignError.message}`)
      continue
    }

    const { data: pricing } = await supabase
      .from('pricing')
      .select('available_count')
      .eq('tier', order.tier)
      .single()
    if (pricing) {
      await supabase
        .from('pricing')
        .update({ available_count: Math.max(0, pricing.available_count - order.quantity) })
        .eq('tier', order.tier)
    }
    result.fulfilled++
  }

  return result
}
