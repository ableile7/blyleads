import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { fulfillPaidSession } from '@/lib/fulfillment'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await req.json()
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session id' }, { status: 400 })
  }

  const result = await fulfillPaidSession(createAdminClient(), sessionId)

  if (!result.sessionPaid) {
    return NextResponse.json({ error: 'Payment has not been completed for this order.' }, { status: 400 })
  }
  if (result.failed.length > 0) {
    return NextResponse.json({ error: result.failed.join('; ') }, { status: 400 })
  }
  if (result.fulfilled === 0 && result.alreadyDone === 0) {
    return NextResponse.json({ error: 'No pending orders found for this session.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, fulfilled: result.fulfilled })
}
