import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from './stripe'

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

    // Atomically claim the leads in one DB call. claim_leads() uses
    // FOR UPDATE SKIP LOCKED, so two simultaneous buyers can never grab the same
    // lead, and it rolls back (assigning nothing) if inventory is short.
    const { data: claimedCount, error: claimError } = await supabase.rpc('claim_leads', {
      p_tier: order.tier,
      p_states: order.states ?? null,
      p_quantity: order.quantity,
      p_agent: order.agent_id,
      p_order: order.id,
      p_sold_at: now,
    })
    if (claimError || (claimedCount ?? 0) < order.quantity) {
      // Couldn't assign the full order — release the claim so it can be retried
      // or manually fulfilled once inventory exists (no partial fulfillment).
      await supabase.from('orders').update({ status: 'pending', stripe_payment_intent: null }).eq('id', order.id)
      result.failed.push(`${order.tier}: ${claimError?.message ?? `only ${claimedCount ?? 0} of ${order.quantity} leads available`}`)
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
