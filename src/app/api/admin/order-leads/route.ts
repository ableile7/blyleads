import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { buildLeadsWorkbook } from '@/lib/leadExport'
import { NextRequest, NextResponse } from 'next/server'

// Admin-only: download the exact leads assigned to a checkout session, so an
// admin can audit/re-send what an agent received. Keyed by stripe_session_id.
// Does NOT touch downloaded_at — that reflects the agent's own download.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

  const adminSupabase = createAdminClient()

  const { data: orders } = await adminSupabase
    .from('orders')
    .select('*')
    .eq('stripe_session_id', sessionId)
    .eq('status', 'paid')

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: 'No paid orders for this session' }, { status: 404 })
  }

  const buffer = await buildLeadsWorkbook(adminSupabase, orders)
  if (!buffer) {
    return NextResponse.json({ error: 'No leads assigned to this order yet' }, { status: 404 })
  }

  // Cast around the strict ArrayBufferLike vs BodyInit typing mismatch; the
  // xlsx byte array is a valid response body at runtime.
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="blyleads-admin-${sessionId.slice(-8)}.xlsx"`,
    },
  })
}
