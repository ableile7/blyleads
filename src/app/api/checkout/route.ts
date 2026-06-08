import { createClient, createAdminClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

type CartItem = { tier: string; quantity: number; states?: string[] }

const PROMO_CODES: Record<string, number> = { 'ELG10': 0.10 }

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const adminSupabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { items, promoCode }: { items: CartItem[]; promoCode?: string } = await req.json()
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Validate each tier and verify availability
  const pricingMap: Record<string, number> = {}
  for (const item of items) {
    if (!item.tier || !item.quantity || item.quantity < 1) {
      return NextResponse.json({ error: `Invalid quantity for ${item.tier}` }, { status: 400 })
    }

    const { data: pricing } = await supabase
      .from('pricing')
      .select('price_per_lead, is_active')
      .eq('tier', item.tier)
      .single()

    if (!pricing || !pricing.is_active) {
      return NextResponse.json({ error: `Tier ${item.tier} not available` }, { status: 400 })
    }

    pricingMap[item.tier] = pricing.price_per_lead

    let availQuery = adminSupabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tier', item.tier)
      .eq('is_sold', false)
    if (item.states && item.states.length > 0) availQuery = availQuery.in('state', item.states)
    const { count: actualAvailable } = await availQuery

    if (!actualAvailable || item.quantity > actualAvailable) {
      return NextResponse.json({
        error: `Only ${actualAvailable ?? 0} ${item.tier} leads available${item.states?.length ? ' for selected states' : ''}`,
      }, { status: 400 })
    }
  }

  const baseUrl = req.headers.get('origin') || 'http://localhost:3000'
  const downloadToken = randomUUID()

  const totalLeads = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, item) => sum + pricingMap[item.tier] * item.quantity, 0)
  const processingFeeCents = Math.round(subtotal * 0.03 * 100)

  // Apply promo discount via Stripe coupon
  let stripeCoupon: string | undefined
  const discountPerLead = promoCode ? PROMO_CODES[promoCode.toUpperCase()] : undefined
  if (discountPerLead) {
    const coupon = await stripe.coupons.create({
      amount_off: Math.round(totalLeads * discountPerLead * 100),
      currency: 'usd',
      duration: 'once',
      name: `Promo: ${promoCode!.toUpperCase()}`,
    })
    stripeCoupon = coupon.id
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      ...items.map(item => {
        const statesLabel = item.states && item.states.length > 0 ? ` (${item.states.join(', ')})` : ''
        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `BlyLeads — ${item.tier} Tier`,
              description: `${item.quantity} leads at $${pricingMap[item.tier]}/lead${statesLabel}`,
            },
            unit_amount: Math.round(pricingMap[item.tier] * item.quantity * 100),
          },
          quantity: 1,
        }
      }),
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'Card Processing Fee (3%)' },
          unit_amount: processingFeeCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    ...(stripeCoupon ? { discounts: [{ coupon: stripeCoupon }] } : {}),
    success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard`,
    metadata: { agent_id: user.id, download_token: downloadToken },
  })

  // One order row per tier, all sharing the same session + download token
  const orderRows = items.map(item => ({
    agent_id: user.id,
    tier: item.tier,
    quantity: item.quantity,
    price_per_lead: pricingMap[item.tier],
    total_amount: pricingMap[item.tier] * item.quantity,
    stripe_session_id: session.id,
    status: 'pending',
    states: item.states && item.states.length > 0 ? item.states : null,
    download_token: downloadToken,
  }))

  await adminSupabase.from('orders').insert(orderRows)

  return NextResponse.json({ url: session.url })
}
