import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const DB_TO_CSV: Record<string, string> = {
  lead_id:               'Lead ID',
  tier:                  'List Code',
  contact_name:          'Contact Name',
  street_address:        'Street Address',
  city:                  'City',
  state:                 'State',
  zip_code:              'ZIP Code',
  primary_phone:         'Primary Phone',
  mobile_phone:          'Mobile Phone',
  loan_amount:           'Loan Amount',
  coverage_type:         'Coverage Type',
  financial_institution: 'Financial Institution',
  auth_phrase:           'Authentication Phrase',
}

const COLUMNS = Object.values(DB_TO_CSV)

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

  const workbook = XLSX.utils.book_new()
  const now = new Date().toISOString()

  for (const order of orders) {
    // Paginate leads in case quantity > 1000
    const allLeads: Record<string, unknown>[] = []
    let page = 0
    const PAGE = 1000
    while (allLeads.length < order.quantity) {
      const remaining = order.quantity - allLeads.length
      const { data: chunk } = await adminSupabase
        .from('leads')
        .select('*')
        .eq('sold_to', user.id)
        .eq('tier', order.tier)
        .not('sold_at', 'is', null)
        // sold_at is identical across a whole batch, so it alone is not a stable
        // sort — add id as a tiebreaker or offset pages overlap and the CSV ends
        // up with duplicate rows (and silently drops just as many real leads).
        .order('sold_at', { ascending: false })
        .order('id', { ascending: true })
        .range(page, page + Math.min(remaining, PAGE) - 1)
      if (!chunk || chunk.length === 0) break
      allLeads.push(...chunk)
      if (chunk.length < PAGE) break
      page += PAGE
    }

    if (allLeads.length === 0) continue

    const rows = allLeads.map(lead =>
      COLUMNS.map(col => {
        const dbKey = Object.entries(DB_TO_CSV).find(([, v]) => v === col)?.[0]
        return dbKey ? ((lead as Record<string, unknown>)[dbKey] ?? '') : ''
      })
    )

    const sheet = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
    XLSX.utils.book_append_sheet(workbook, sheet, order.tier)

    await adminSupabase
      .from('orders')
      .update({ downloaded_at: now })
      .eq('id', order.id)
  }

  if (workbook.SheetNames.length === 0) {
    return NextResponse.redirect(new URL('/orders?error=no_leads', req.url))
  }

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const sessionId = orders[0].stripe_session_id?.slice(-8) || 'download'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="blyleads-${sessionId}.xlsx"`,
    },
  })
}
