import { createAdminClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { fulfillPaidSession } from '@/lib/fulfillment'
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
    const result = await fulfillPaidSession(createAdminClient(), session.id)
    if (result.failed.length > 0) {
      console.error(`Webhook fulfillment issues for session ${session.id}:`, result.failed)
    }
  }

  return NextResponse.json({ received: true })
}
