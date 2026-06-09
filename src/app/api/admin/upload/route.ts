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

// Normalize a header to lowercase letters/digits only for fuzzy matching
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Keyword groups for each DB field — first match wins
const FIELD_KEYWORDS: Record<string, string[]> = {
  lead_id:               ['mortgageid','mortgageidnumber','leadid','sourceleadid','recordid','sourceid','prospectid','clientid'],
  contact_name:          ['fullname','contactname','name','clientname','customername','prospectname'],
  first_name:            ['firstname','fname'],
  last_name:             ['lastname','lname','surname'],
  street_address:        ['streetaddress','address1','streetaddr','address','street','addr'],
  city:                  ['city','town'],
  state:                 ['state','st','statecode','province'],
  zip_code:              ['zipcode','zip4','zipplusfour','zip','postalcode','postal'],
  primary_phone:         ['landlinecellcombo','primaryphone','phonenumber','homephone','phone1','phone'],
  secondary_phone:       ['recentlandline','secondaryphone','phone2','altphone','landline'],
  mobile_phone:          ['cellphone','mobilephone','wireless','mobile','cell'],
  loan_amount:           ['mortgageamount','mortageamount','loanamount','loanamt','amount'],
  coverage_type:         ['policytype','coveragetype','coverage','policy','producttype'],
  financial_institution: ['financialinstitution','mortgagecompany','lender','bank','institution','servicer'],
}

const DROP_KEYWORDS = new Set(['gender','education','timezone','timzone','areacode','dob','dateofbirth','tobaccouser','healthnotes','spanishspeaking','recorddate'])

function buildColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const firstNameCol: string[] = []
  const lastNameCol: string[] = []

  for (const header of headers) {
    const n = norm(header)
    if (DROP_KEYWORDS.has(n)) continue

    let matched = false
    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
      if (keywords.includes(n)) {
        if (field === 'first_name') { firstNameCol.push(header); matched = true; break }
        if (field === 'last_name')  { lastNameCol.push(header);  matched = true; break }
        map[header] = field
        matched = true
        break
      }
    }
    // Partial match fallback — check if any keyword is contained in the normalized header
    if (!matched) {
      for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
        if (keywords.some(k => n.includes(k) || k.includes(n))) {
          if (field === 'first_name') { firstNameCol.push(header); break }
          if (field === 'last_name')  { lastNameCol.push(header);  break }
          map[header] = field
          break
        }
      }
    }
  }

  // Store first/last name columns separately for combining later
  if (firstNameCol.length) map['__first_name__'] = firstNameCol[0]
  if (lastNameCol.length)  map['__last_name__']  = lastNameCol[0]

  return map
}

async function paginateAll<T>(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (q: any) => any
): Promise<T[]> {
  const results: T[] = []
  let page = 0
  const PAGE = 1000
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select(columns).range(page, page + PAGE - 1)
    if (filter) q = filter(q)
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

  // Step 1: Build column map from actual headers in this file
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  const colMap = buildColumnMap(headers)
  const firstNameCol = colMap['__first_name__']
  const lastNameCol  = colMap['__last_name__']

  // Step 1: Map all rows up front
  const mappedRows: Record<string, string>[] = rows.map(row => {
    const mapped: Record<string, string> = {}
    for (const [origKey, val] of Object.entries(row)) {
      const trimmedKey = origKey.trim()
      const dbKey = colMap[trimmedKey]
      if (dbKey && !dbKey.startsWith('__')) mapped[dbKey] = val?.trim() || ''
    }
    // Combine first + last name into contact_name if no full name column found
    if (!mapped['contact_name'] && (firstNameCol || lastNameCol)) {
      const first = (firstNameCol ? (row as Record<string,string>)[firstNameCol]?.trim() : '') || ''
      const last  = (lastNameCol  ? (row as Record<string,string>)[lastNameCol]?.trim()  : '') || ''
      mapped['contact_name'] = [first, last].filter(Boolean).join(' ')
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

  // Step 8: Sync available_count from actual DB count (always accurate)
  const { count: actualAvailable } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tier', tier)
    .eq('is_sold', false)

  await supabase.from('pricing').update({
    available_count: actualAvailable ?? 0,
  }).eq('tier', tier)

  return NextResponse.json({ inserted, skipped, tier })
}
