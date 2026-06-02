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

  // Find available leads for this tier
  const { data: leads } = await supabase
    .from('leads')
    .select('id')
    .eq('tier', order.tier)
    .eq('is_sold', false)
    .limit(order.quantity)

  if (!leads || leads.length < order.quantity) {
    return NextResponse.json({ error: `Only ${leads?.length ?? 0} leads available, need ${order.quantity}` }, { status: 400 })
  }

  const leadIds = leads.map(l => l.id)
  const now = new Date().toISOString()

  // Mark leads as sold
  await supabase
    .from('leads')
    .update({ is_sold: true, sold_to: order.agent_id, sold_at: now })
    .in('id', leadIds)

  // Mark order as paid
  await supabase
    .from('orders')
    .update({ status: 'paid' })
    .eq('id', orderId)

  // Update available_count
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
