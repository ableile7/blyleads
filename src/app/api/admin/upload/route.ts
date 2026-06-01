import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'

// Tier detection from filename
function detectTier(filename: string): string | null {
  const upper = filename.toUpperCase()
  if (upper.includes('BRONZE')) return 'Prime'
  if (upper.includes('COPPER')) return 'Select'
  if (upper.includes('RUBY'))   return 'Premier'
  return null
}

// Column rename map from spec
const COLUMN_MAP: Record<string, string> = {
  'Mortgage ID Number':    'lead_id',
  'Campaign Number':       'tier',
  'Upload Date':           'record_date',
  'Full Name':             'contact_name',
  'address':               'street_address',
  'city':                  'city',
  'state':                 'state',
  'zip_plus_four':         'zip_code',
  'landline_cell_combo':   'primary_phone',
  'recent_landline_1':     'secondary_phone',
  'cell_phone':            'mobile_phone',
  'mortage_amount':        'loan_amount',
  'policy_type':           'coverage_type',
  'lender':                'financial_institution',
  // Also handle already-renamed headers
  'Lead ID':               'lead_id',
  'Record Date':           'record_date',
  'Contact Name':          'contact_name',
  'Street Address':        'street_address',
  'City':                  'city',
  'State':                 'state',
  'ZIP Code':              'zip_code',
  'Primary Phone':         'primary_phone',
  'Mobile Phone':          'mobile_phone',
  'Loan Amount':           'loan_amount',
  'Coverage Type':         'coverage_type',
  'Financial Institution': 'financial_institution',
}

const DROP_COLUMNS = new Set(['landline', 'gender', 'education'])

export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const tier = detectTier(file.name)
  if (!tier) return NextResponse.json({ error: 'Filename must contain BRONZE, COPPER, or RUBY to detect tier' }, { status: 400 })

  const text = await file.text()
  const { data: rows, errors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  if (errors.length > 0 && rows.length === 0) {
    return NextResponse.json({ error: 'Failed to parse CSV' }, { status: 400 })
  }

  // Fetch existing lead IDs to deduplicate
  const supabase = createAdminClient()
  const { data: existing } = await supabase.from('leads').select('lead_id').eq('tier', tier)
  const existingIds = new Set(existing?.map(r => r.lead_id) ?? [])

  const toInsert = []
  let skipped = 0

  for (const row of rows) {
    // Remap columns
    const mapped: Record<string, string> = {}
    for (const [origKey, val] of Object.entries(row)) {
      const trimmedKey = origKey.trim()
      if (DROP_COLUMNS.has(trimmedKey.toLowerCase())) continue
      const dbKey = COLUMN_MAP[trimmedKey]
      if (dbKey) mapped[dbKey] = val?.trim() || ''
    }

    const leadId = mapped['lead_id']
    if (!leadId) { skipped++; continue }
    if (existingIds.has(leadId)) { skipped++; continue }

    existingIds.add(leadId)
    toInsert.push({
      tier,
      lead_id:              leadId,
      record_date:          mapped['record_date'] || null,
      contact_name:         mapped['contact_name'] || null,
      street_address:       mapped['street_address'] || null,
      city:                 mapped['city'] || null,
      state:                mapped['state'] || null,
      zip_code:             mapped['zip_code'] || null,
      primary_phone:        mapped['primary_phone'] || null,
      mobile_phone:         mapped['mobile_phone'] || null,
      loan_amount:          mapped['loan_amount'] || null,
      coverage_type:        mapped['coverage_type'] || null,
      financial_institution: mapped['financial_institution'] || null,
      is_sold:              false,
    })
  }

  // Insert in batches of 500
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500)
    const { error } = await supabase.from('leads').insert(batch)
    if (!error) inserted += batch.length
  }

  // Update available_count in pricing
  const { data: pricing } = await supabase.from('pricing').select('available_count').eq('tier', tier).single()
  if (pricing) {
    await supabase.from('pricing').update({
      available_count: pricing.available_count + inserted,
    }).eq('tier', tier)
  }

  return NextResponse.json({ inserted, skipped, tier })
}
