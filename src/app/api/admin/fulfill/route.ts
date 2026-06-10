import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { fetchAvailableLeadIds, markLeadsSold } from '@/lib/fulfillment'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await req.json()
  const supabase = createAdminClient()

  // Get all pending orders for this session
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('stripe_session_id', sessionId)
    .eq('status', 'pending')

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: 'No pending orders found for this session' }, { status: 404 })
  }

  const now = new Date().toISOString()

  for (const order of orders) {
    const leadIds = await fetchAvailableLeadIds(supabase, order.tier, order.states, order.quantity)

    if (leadIds.length < order.quantity) {
      return NextResponse.json({
        error: `Only ${leadIds.length} ${order.tier} leads available, need ${order.quantity}`,
      }, { status: 400 })
    }

    const updateError = await markLeadsSold(supabase, leadIds, order.agent_id, now)
    if (updateError) {
      return NextResponse.json({
        error: `Failed to assign ${order.tier} leads: ${updateError.message}`,
      }, { status: 500 })
    }

    await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', order.id)

    // Update pricing available_count
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
  }

  return NextResponse.json({ ok: true })
}
