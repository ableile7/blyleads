import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'

export const maxDuration = 300 // 5 minutes on Vercel Pro

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

function detectTier(filename: string): string | null {
  const upper = filename.toUpperCase()
  if (upper.includes('BRONZE')) return 'Prime'
  if (upper.includes('COPPER')) return 'Select'
  if (upper.includes('RUBY'))   return 'Premier'
  if (upper.includes('GOLD'))   return 'Core'
  if (upper.includes('SILVER')) return 'Essential'
  return null
}

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

async function paginateAll<T>(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  columns: string,
  filter?: (q: ReturnType<ReturnType<typeof createAdminClient>['from']>) => ReturnType<ReturnType<typeof createAdminClient>['from']>
): Promise<T[]> {
  const results: T[] = []
  let page = 0
  const PAGE = 1000
  while (true) {
    let q = supabase.from(table).select(columns).range(page, page + PAGE - 1)
    if (filter) q = filter(q as never) as never
    const { data } = await q
    if (!data || data.length === 0) break
    results.push(...(data as T[]))
    if (data.length < PAGE) break
    page += PAGE
  }
  return results
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const tier = detectTier(file.name)
  if (!tier) return NextResponse.json({ error: 'Filename must contain BRONZE, COPPER, RUBY, GOLD, or SILVER to detect tier' }, { status: 400 })

  const text = await file.text()
  const { data: rows, errors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  if (errors.length > 0 && rows.length === 0) {
    return NextResponse.json({ error: 'Failed to parse CSV' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Step 1: Map all rows up front
  const mappedRows: Record<string, string>[] = rows.map(row => {
    const mapped: Record<string, string> = {}
    for (const [origKey, val] of Object.entries(row)) {
      const trimmedKey = origKey.trim()
      if (DROP_COLUMNS.has(trimmedKey.toLowerCase())) continue
      const dbKey = COLUMN_MAP[trimmedKey]
      if (dbKey) mapped[dbKey] = val?.trim() || ''
    }
    return mapped
  })

  // Step 2: Check only source_lead_ids from THIS batch against DB (efficient)
  const batchSourceIds = mappedRows.map(r => r['lead_id']).filter(Boolean)
  const existingSourceIds = new Set<string>()
  for (let i = 0; i < batchSourceIds.length; i += 1000) {
    const chunk = batchSourceIds.slice(i, i + 1000)
    const { data } = await supabase.from('leads').select('source_lead_id').in('source_lead_id', chunk)
    data?.forEach((r: { source_lead_id: string }) => { if (r.source_lead_id) existingSourceIds.add(r.source_lead_id) })
  }

  // Step 3: Paginate existing name+phone pairs (2 small columns only)
  const existingNamePhone = new Set<string>()
  const npRows = await paginateAll<{ contact_name: string; primary_phone: string }>(
    supabase, 'leads', 'contact_name, primary_phone',
    q => q.not('contact_name', 'is', null).not('primary_phone', 'is', null)
  )
  npRows.forEach(r => {
    existingNamePhone.add(`${r.contact_name.toLowerCase().trim()}|${r.primary_phone.trim()}`)
  })

  // Step 4: Paginate existing auth phrases (1 column only)
  const usedPhrases = new Set<string>()
  const phraseRows = await paginateAll<{ auth_phrase: string }>(
    supabase, 'leads', 'auth_phrase',
    q => q.not('auth_phrase', 'is', null)
  )
  phraseRows.forEach(r => { if (r.auth_phrase) usedPhrases.add(r.auth_phrase) })

  // Step 5: Get last BLY number
  const { data: lastLead } = await supabase
    .from('leads').select('lead_id').like('lead_id', 'BLY-%')
    .order('lead_id', { ascending: false }).limit(1)
  let nextNum = 1
  if (lastLead && lastLead.length > 0) {
    const lastNum = parseInt(lastLead[0].lead_id.replace('BLY-', ''), 10)
    if (!isNaN(lastNum)) nextNum = lastNum + 1
  }

  // Step 6: Filter duplicates and build insert list
  const toInsert = []
  let skipped = 0

  for (const mapped of mappedRows) {
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

  // Step 7: Insert in batches of 500
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500)
    const { error } = await supabase.from('leads').insert(batch)
    if (!error) inserted += batch.length
  }

  // Step 8: Update available_count in pricing
  const { data: pricing } = await supabase.from('pricing').select('available_count').eq('tier', tier).single()
  if (pricing) {
    await supabase.from('pricing').update({
      available_count: pricing.available_count + inserted,
    }).eq('tier', tier)
  }

  return NextResponse.json({ inserted, skipped, tier })
}
