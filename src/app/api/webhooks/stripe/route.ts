import { createAdminClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
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
    const { agent_id, tier, quantity, price_per_lead } = session.metadata!
    const qty = parseInt(quantity)
    const supabase = createAdminClient()

    // Find available leads for this tier
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .eq('tier', tier)
      .eq('is_sold', false)
      .limit(qty)

    if (!leads || leads.length < qty) {
      console.error('Not enough leads available for order')
      return NextResponse.json({ error: 'Not enough leads' }, { status: 400 })
    }

    const leadIds = leads.map(l => l.id)
    const now = new Date().toISOString()

    // Mark leads as sold
    await supabase
      .from('leads')
      .update({ is_sold: true, sold_to: agent_id, sold_at: now })
      .in('id', leadIds)

    // Update order to paid and generate download token
    await supabase
      .from('orders')
      .update({
        status: 'paid',
        stripe_payment_intent: session.payment_intent as string,
      })
      .eq('stripe_session_id', session.id)

    // Update available_count in pricing
    const { data: pricing } = await supabase
      .from('pricing')
      .select('available_count')
      .eq('tier', tier)
      .single()

    if (pricing) {
      await supabase
        .from('pricing')
        .update({ available_count: Math.max(0, pricing.available_count - qty) })
        .eq('tier', tier)
    }
  }

  return NextResponse.json({ received: true })
}
