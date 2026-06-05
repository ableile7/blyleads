import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'

const WORDS = [
  'apple','bridge','cabin','daisy','eagle','fence','globe','honey','island','jacket',
  'kite','lemon','maple','noble','ocean','panda','quilt','river','solar','tiger',
  'umbrella','violet','walnut','xenon','yellow','zebra','amber','brave','cedar','drift',
  'ember','frost','grape','haven','ivory','jewel','karma','lunar','mango','north',
  'olive','pearl','quiet','ranch','stone','trout','ultra','vivid','wheat','xylo',
  'yarrow','zeal','anchor','bloom','cloud','delta','elbow','flint','gravel','hollow',
  'indigo','jungle','kelp','lantern','meadow','nimble','onyx','prism','quartz','robin',
  'silver','thorn','urban','velvet','willow','xenial','yarrow','zephyr','acorn','birch',
  'copper','dune','echo','flare','granite','harbor','iron','jade','kindle','lark',
  'mossy','neon','opal','pine','quest','reed','swift','terra','umber','vale',
  'wren','axis','brook','cliff','dawn','edge','forge','glow','haze','inlet',
]

function randomPhrase(): string {
  const shuffle = [...WORDS].sort(() => Math.random() - 0.5)
  return shuffle.slice(0, 3).join(' ')
}

function uniquePhrase(used: Set<string>): string {
  let phrase = randomPhrase()
  while (used.has(phrase)) phrase = randomPhrase()
  used.add(phrase)
  return phrase
}

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
  // Already-renamed headers
  'Lead ID':               'lead_id',
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

  const supabase = createAdminClient()

  // Fetch existing records for deduplication by source ID and name+phone
  const { data: existing } = await supabase.from('leads').select('source_lead_id, contact_name, primary_phone, auth_phrase')
  const existingSourceIds = new Set(existing?.map(r => r.source_lead_id).filter(Boolean) ?? [])
  const existingNamePhone = new Set(
    existing
      ?.filter(r => r.contact_name && r.primary_phone)
      .map(r => `${r.contact_name?.toLowerCase().trim()}|${r.primary_phone?.trim()}`) ?? []
  )
  const usedPhrases = new Set(existing?.map(r => r.auth_phrase).filter(Boolean) ?? [])

  // Find the current highest BLY sequential number
  const { data: lastLead } = await supabase
    .from('leads')
    .select('lead_id')
    .like('lead_id', 'BLY-%')
    .order('lead_id', { ascending: false })
    .limit(1)
  let nextNum = 1
  if (lastLead && lastLead.length > 0) {
    const lastNum = parseInt(lastLead[0].lead_id.replace('BLY-', ''), 10)
    if (!isNaN(lastNum)) nextNum = lastNum + 1
  }

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

    const sourceId = mapped['lead_id'] || null
    if (sourceId && existingSourceIds.has(sourceId)) { skipped++; continue }

    const namePhoneKey = mapped['contact_name'] && mapped['primary_phone']
      ? `${mapped['contact_name'].toLowerCase().trim()}|${mapped['primary_phone'].trim()}`
      : null
    if (namePhoneKey && existingNamePhone.has(namePhoneKey)) { skipped++; continue }

    if (sourceId) existingSourceIds.add(sourceId)
    if (namePhoneKey) existingNamePhone.add(namePhoneKey)

    const blyId = `BLY-${String(nextNum).padStart(6, '0')}`
    nextNum++

    toInsert.push({
      tier,
      lead_id:               blyId,
      source_lead_id:        sourceId,
      contact_name:          mapped['contact_name'] || null,
      street_address:        mapped['street_address'] || null,
      city:                  mapped['city'] || null,
      state:                 mapped['state'] || null,
      zip_code:              mapped['zip_code'] || null,
      primary_phone:         mapped['primary_phone'] || null,
      mobile_phone:          mapped['mobile_phone'] || null,
      loan_amount:           mapped['loan_amount'] || null,
      coverage_type:         mapped['coverage_type'] || null,
      financial_institution: mapped['financial_institution'] || null,
      auth_phrase:           uniquePhrase(usedPhrases),
      is_sold:               false,
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
