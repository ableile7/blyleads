import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const DB_TO_CSV: Record<string, string> = {
  lead_id: 'Lead ID',
  tier: 'List Code',
  record_date: 'Record Date',
  contact_name: 'Contact Name',
  street_address: 'Street Address',
  city: 'City',
  state: 'State',
  zip_code: 'ZIP Code',
  primary_phone: 'Primary Phone',
  mobile_phone: 'Mobile Phone',
  loan_amount: 'Loan Amount',
  coverage_type: 'Coverage Type',
  financial_institution: 'Financial Institution',
}

const COLUMNS = Object.values(DB_TO_CSV)

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminSupabase = createAdminClient()

  // Find all paid orders for this download token
  const { data: orders } = await adminSupabase
    .from('orders')
    .select('*')
    .eq('download_token', token)
    .eq('agent_id', user.id)
    .eq('status', 'paid')

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 })
  }

  const workbook = XLSX.utils.book_new()
  const now = new Date().toISOString()

  for (const order of orders) {
    const { data: leads } = await adminSupabase
      .from('leads')
      .select('*')
      .eq('sold_to', user.id)
      .eq('tier', order.tier)
      .not('sold_at', 'is', null)
      .order('sold_at', { ascending: false })
      .limit(order.quantity)

    if (!leads || leads.length === 0) continue

    const rows = leads.map(lead =>
      COLUMNS.map(col => {
        const dbKey = Object.entries(DB_TO_CSV).find(([, v]) => v === col)?.[0]
        return dbKey ? (lead[dbKey] ?? '') : ''
      })
    )

    const sheet = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
    XLSX.utils.book_append_sheet(workbook, sheet, order.tier)

    await adminSupabase
      .from('orders')
      .update({ downloaded_at: now })
      .eq('id', order.id)
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
