import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const CSV_COLUMNS = [
  'Lead ID', 'List Code', 'Record Date', 'Contact Name', 'Street Address',
  'City', 'State', 'ZIP Code', 'Area Code', 'Time Zone', 'Primary Phone',
  'Secondary Phone', 'Alt Phone Combo', 'Mobile Phone', 'Last Contact Date',
  'Date of Birth', 'Health Notes', 'Tobacco User', 'Loan Amount',
  'Coverage Type', 'Financial Institution', 'Spanish Speaking',
]

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

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminSupabase = createAdminClient()

  // Validate token and get order
  const { data: order } = await adminSupabase
    .from('orders')
    .select('*')
    .eq('download_token', token)
    .eq('agent_id', user.id)
    .eq('status', 'paid')
    .single()

  if (!order) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 })

  // Get the leads for this order
  const { data: leads } = await adminSupabase
    .from('leads')
    .select('*')
    .eq('sold_to', user.id)
    .eq('tier', order.tier)
    .not('sold_at', 'is', null)
    .order('sold_at', { ascending: false })
    .limit(order.quantity)

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: 'No leads found' }, { status: 404 })
  }

  // Mark as downloaded
  await adminSupabase
    .from('orders')
    .update({ downloaded_at: new Date().toISOString() })
    .eq('id', order.id)

  // Build CSV
  const rows = [CSV_COLUMNS.join(',')]
  for (const lead of leads) {
    const row = CSV_COLUMNS.map(col => {
      const dbKey = Object.entries(DB_TO_CSV).find(([, v]) => v === col)?.[0]
      const val = dbKey ? (lead[dbKey] ?? '') : ''
      return `"${String(val).replace(/"/g, '""')}"`
    })
    rows.push(row.join(','))
  }

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="blyleads-${order.tier.toLowerCase()}-${order.id.slice(0, 8)}.csv"`,
    },
  })
}
