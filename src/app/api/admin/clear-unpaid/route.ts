import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { stripe } from '@/lib/stripe'
import { NextResponse } from 'next/server'

// Removes abandoned-checkout order rows (status 'pending' that never got paid).
// Stripe is the source of truth: a pending order is only cleared once we've
// confirmed its session isn't paid. Any session still 'open' (the agent could
// still pay) is force-expired first, so deleting the row can never strand a
// payment that lands later — the webhook keys off these rows to fulfill.
export async function POST() {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('id, stripe_session_id')
    .eq('status', 'pending')

  if (!orders || orders.length === 0) {
    return NextResponse.json({ cleared: 0 })
  }

  // Group pending order rows by their checkout session.
  const orderIdsBySession = new Map<string, string[]>()
  for (const o of orders) {
    const key = o.stripe_session_id || ''
    if (!orderIdsBySession.has(key)) orderIdsBySession.set(key, [])
    orderIdsBySession.get(key)!.push(o.id)
  }

  const idsToDelete: string[] = []

  for (const [sessionId, orderIds] of Array.from(orderIdsBySession.entries())) {
    // No/invalid session id → the order can never be paid or fulfilled; junk.
    if (!sessionId.startsWith('cs_')) {
      idsToDelete.push(...orderIds)
      continue
    }

    let session
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId)
    } catch {
      // Can't verify with Stripe → leave it alone rather than risk deleting a real order.
      continue
    }

    // Genuinely paid → never clear; this needs fulfillment, not deletion.
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
      continue
    }

    // Still payable → expire it first so no payment can land after we delete the row.
    if (session.status === 'open') {
      try {
        await stripe.checkout.sessions.expire(sessionId)
      } catch {
        // Couldn't expire → don't delete; we can't guarantee it won't be paid.
        continue
      }
    }

    idsToDelete.push(...orderIds)
  }

  if (idsToDelete.length === 0) {
    return NextResponse.json({ cleared: 0 })
  }

  // Chunk deletes to keep the id list out of URL-length limits (large backlogs).
  for (let i = 0; i < idsToDelete.length; i += 200) {
    const chunk = idsToDelete.slice(i, i + 200)
    const { error } = await supabase.from('orders').delete().in('id', chunk)
    if (error) {
      return NextResponse.json({ error: `Failed to clear orders: ${error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ cleared: idsToDelete.length })
}
