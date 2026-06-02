import { createClient, createAdminClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const adminSupabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tier, quantity } = await req.json()
  if (!tier || !quantity || quantity < 1) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data: pricing } = await supabase
    .from('pricing')
    .select('price_per_lead, available_count, is_active')
    .eq('tier', tier)
    .single()

  if (!pricing || !pricing.is_active) {
    return NextResponse.json({ error: 'Tier not available' }, { status: 400 })
  }
  if (quantity > pricing.available_count) {
    return NextResponse.json({ error: `Only ${pricing.available_count} leads available` }, { status: 400 })
  }

  const total = pricing.price_per_lead * quantity
  const baseUrl = req.headers.get('origin') || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `BlyLeads — ${tier} Tier`,
          description: `${quantity} leads at $${pricing.price_per_lead}/lead`,
        },
        unit_amount: Math.round(total * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard`,
    metadata: {
      agent_id: user.id,
      tier,
      quantity: String(quantity),
      price_per_lead: String(pricing.price_per_lead),
    },
  })

  // Create pending order record (admin client bypasses RLS)
  await adminSupabase.from('orders').insert({
    agent_id: user.id,
    tier,
    quantity,
    price_per_lead: pricing.price_per_lead,
    total_amount: total,
    stripe_session_id: session.id,
    status: 'pending',
  })

  return NextResponse.json({ url: session.url })
}
