import { createClient, createAdminClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

type CartItem = {
  tier: string
  quantity: number
  states?: string[] | null
  // Per-state breakdown the agent entered, e.g. { NC: 500, OH: 500 }. When
  // present, each state is fulfilled for exactly its amount (see fulfillment).
  stateQuantities?: Record<string, number> | null
}

const PROMO_CODES: Record<string, number> = { 'ELG2026': 0.10 }
// 100%-off codes locked to a specific agent email (free leads — keep restricted).
const FREE_CODES: Record<string, string> = { 'STARRFREE': 'davidstarr.pinnacle@gmail.com' }

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const adminSupabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Middleware only guards pages, not /api/* — enforce approval here too so a
  // pending (or rejected-but-still-signed-in) agent can't buy via direct API call.
  const { data: agent } = await supabase
    .from('agents')
    .select('status')
    .eq('id', user.id)
    .single()
  if (!agent || agent.status !== 'approved') {
    return NextResponse.json({ error: 'Your account has not been approved to purchase leads.' }, { status: 403 })
  }

  const { items, promoCode }: { items: CartItem[]; promoCode?: string } = await req.json()
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Validate each tier and verify availability
  const pricingMap: Record<string, number> = {}
  for (const item of items) {
    if (!item.tier || !Number.isInteger(item.quantity) || item.quantity < 1) {
      return NextResponse.json({ error: `Invalid quantity for ${item.tier}` }, { status: 400 })
    }

    // Never trust the client's quantity when a per-state breakdown is present:
    // Stripe charges by quantity, but fulfillment claims sum(stateQuantities) —
    // a mismatch would deliver more leads than were paid for.
    if (item.stateQuantities && Object.keys(item.stateQuantities).length > 0) {
      const stateValues = Object.values(item.stateQuantities)
      if (stateValues.some(q => !Number.isInteger(q) || q < 0)) {
        return NextResponse.json({ error: `Invalid state quantities for ${item.tier}` }, { status: 400 })
      }
      const stateSum = stateValues.reduce((s, q) => s + q, 0)
      if (stateSum !== item.quantity) {
        return NextResponse.json({ error: `Quantity mismatch for ${item.tier}: ${item.quantity} ordered but ${stateSum} across states` }, { status: 400 })
      }
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

    // Verify availability. With a per-state breakdown, check EACH state has
    // enough so we never promise leads a state can't cover (the old combined
    // check could pass while an individual state was short).
    const sq = item.stateQuantities
    if (sq && Object.keys(sq).length > 0) {
      for (const [state, qty] of Object.entries(sq)) {
        if (qty <= 0) continue
        const { count } = await adminSupabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('tier', item.tier)
          .eq('is_sold', false)
          .eq('state', state)
        if (!count || qty > count) {
          return NextResponse.json({
            error: `Only ${count ?? 0} ${item.tier} leads available in ${state}`,
          }, { status: 400 })
        }
      }
    } else {
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
  }

  const baseUrl = req.headers.get('origin') || 'http://localhost:3000'
  const downloadToken = randomUUID()

  const totalLeads = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, item) => sum + pricingMap[item.tier] * item.quantity, 0)
  const processingFeeCents = Math.round(subtotal * 0.03 * 100)

  // Apply promo discount via Stripe coupon
  let stripeCoupon: string | undefined
  const code = promoCode?.toUpperCase()
  const freeForEmail = code ? FREE_CODES[code] : undefined
  if (freeForEmail) {
    // 100%-off code — only valid for the agent it's locked to.
    if ((user.email || '').toLowerCase() !== freeForEmail.toLowerCase()) {
      return NextResponse.json({ error: 'This promo code is not valid for your account.' }, { status: 400 })
    }
    const coupon = await stripe.coupons.create({ percent_off: 100, duration: 'once', name: `Free: ${code}` })
    stripeCoupon = coupon.id
  } else {
    const discountPerLead = code ? PROMO_CODES[code] : undefined
    if (discountPerLead) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(totalLeads * discountPerLead * 100),
        currency: 'usd',
        duration: 'once',
        name: `Promo: ${code}`,
      })
      stripeCoupon = coupon.id
    }
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
    state_quantities: item.stateQuantities && Object.keys(item.stateQuantities).length > 0 ? item.stateQuantities : null,
    download_token: downloadToken,
  }))

  await adminSupabase.from('orders').insert(orderRows)

  return NextResponse.json({ url: session.url })
}
