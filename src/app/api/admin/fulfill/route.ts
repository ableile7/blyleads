import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await req.json()
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'paid') return NextResponse.json({ error: 'Already fulfilled' }, { status: 400 })

  // Build leads query — filter by state if the order has state preferences
  let leadsQuery = supabase
    .from('leads')
    .select('id')
    .eq('tier', order.tier)
    .eq('is_sold', false)
    .limit(order.quantity)

  if (order.states && order.states.length > 0) {
    leadsQuery = leadsQuery.in('state', order.states)
  }

  const { data: leads } = await leadsQuery

  if (!leads || leads.length < order.quantity) {
    return NextResponse.json({ error: `Only ${leads?.length ?? 0} leads available, need ${order.quantity}` }, { status: 400 })
  }

  const leadIds = leads.map(l => l.id)
  const now = new Date().toISOString()

  await supabase
    .from('leads')
    .update({ is_sold: true, sold_to: order.agent_id, sold_at: now })
    .in('id', leadIds)

  await supabase
    .from('orders')
    .update({ status: 'paid' })
    .eq('id', orderId)

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

  return NextResponse.json({ ok: true })
}
