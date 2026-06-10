import { createAdminClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { fetchAvailableLeadIds, markLeadsSold } from '@/lib/fulfillment'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const supabase = createAdminClient()

    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('stripe_session_id', session.id)
      .eq('status', 'pending')

    if (!orders || orders.length === 0) {
      return NextResponse.json({ received: true })
    }

    const now = new Date().toISOString()

    for (const order of orders) {
      const leadIds = await fetchAvailableLeadIds(supabase, order.tier, order.states, order.quantity)

      if (leadIds.length < order.quantity) {
        console.error(`Not enough ${order.tier} leads for order ${order.id}: found ${leadIds.length}, need ${order.quantity}`)
        continue
      }

      const updateLeadsError = await markLeadsSold(supabase, leadIds, order.agent_id, now)
      if (updateLeadsError) {
        console.error(`Failed to assign leads for order ${order.id}:`, updateLeadsError)
        continue
      }

      await supabase
        .from('orders')
        .update({ status: 'paid', stripe_payment_intent: session.payment_intent as string })
        .eq('id', order.id)

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
  }

  return NextResponse.json({ received: true })
}
