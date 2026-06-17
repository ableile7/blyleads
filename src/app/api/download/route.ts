import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buildLeadsWorkbook } from '@/lib/leadExport'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.redirect(new URL('/orders?error=missing_token', req.url))

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/', req.url))

  const adminSupabase = createAdminClient()

  // Find all paid orders for this download token
  const { data: orders } = await adminSupabase
    .from('orders')
    .select('*')
    .eq('download_token', token)
    .eq('agent_id', user.id)
    .eq('status', 'paid')

  if (!orders || orders.length === 0) {
    return NextResponse.redirect(new URL('/orders?error=not_ready', req.url))
  }

  const buffer = await buildLeadsWorkbook(adminSupabase, orders)
  if (!buffer) {
    return NextResponse.redirect(new URL('/orders?error=no_leads', req.url))
  }

  await adminSupabase
    .from('orders')
    .update({ downloaded_at: new Date().toISOString() })
    .in('id', orders.map(o => o.id))

  const sessionId = orders[0].stripe_session_id?.slice(-8) || 'download'

  // Cast around the strict ArrayBufferLike vs BodyInit typing mismatch; the
  // xlsx byte array is a valid response body at runtime.
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="blyleads-${sessionId}.xlsx"`,
    },
  })
}
