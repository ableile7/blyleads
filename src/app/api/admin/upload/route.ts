import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { isValidTier } from '@/lib/tiers'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60 // each chunk is small; no long-running scans

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

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const FIELD_KEYWORDS: Record<string, string[]> = {
  lead_id:               ['mortgageid','mortgageidnumber','leadid','sourceleadid','recordid','sourceid','prospectid','clientid'],
  contact_name:          ['fullname','contactname','name','clientname','customername','prospectname','borrowername','borrower'],
  first_name:            ['firstname','fname'],
  last_name:             ['lastname','lname','surname'],
  street_address:        ['streetaddress','address1','streetaddr','address','street','addr'],
  city:                  ['city','town'],
  state:                 ['state','st','statecode','province'],
  zip_code:              ['zipcode','zip4','zipplusfour','zip','postalcode','postal'],
  primary_phone:         ['landlinecellcombo','primaryphone','phonenumber','homephone','phone1','phone','callerno','callernumber','caller'],
  secondary_phone:       ['recentlandline','secondaryphone','phone2','landline'],
  mobile_phone:          ['cellphone','mobilephone','wireless','mobile','cell','alternatephoneno','alternatephone','altphone'],
  loan_amount:           ['mortgageamount','mortageamount','loanamount','loanamt','amount'],
  coverage_type:         ['policytype','coveragetype','coverage','policy','producttype'],
  financial_institution: ['financialinstitution','mortgagecompany','lender','bank','institution','servicer'],
}

const DROP_KEYWORDS = new Set([
  'gender','education','timezone','timzone','areacode','dob','dateofbirth','tobaccouser','healthnotes','spanishspeaking','recorddate',
  'county','callintime','borrowerage','borrowermedicalissues','borrowertobacco','coborrower','closingdate','lastaction',
])

function buildColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const firstNameCol: string[] = []
  const lastNameCol: string[] = []
  const usedFields = new Set<string>()

  function assign(header: string, field: string): boolean {
    if (field === 'first_name') { firstNameCol.push(header); return true }
    if (field === 'last_name')  { lastNameCol.push(header);  return true }
    if (usedFields.has(field)) return false
    map[header.trim()] = field
    usedFields.add(field)
    return true
  }

  for (const header of headers) {
    const n = norm(header)
    if (DROP_KEYWORDS.has(n)) continue
    let matched = false
    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
      if (keywords.includes(n)) { matched = assign(header, field); break }
    }
    if (!matched) {
      for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
        if (keywords.some(k => k.length >= 4 && (n.includes(k) || k.includes(n)))) { assign(header, field); break }
      }
    }
  }
  if (firstNameCol.length) map['__first_name__'] = firstNameCol[0]
  if (lastNameCol.length)  map['__last_name__']  = lastNameCol[0]
  return map
}

// Look up which of `values` already exist in `column`, scoped to just these
// values (chunked .in() queries) — O(chunk), independent of table size.
async function existingValues(
  supabase: ReturnType<typeof createAdminClient>,
  column: string,
  selectCols: string,
  values: string[],
): Promise<Record<string, string>[]> {
  const found: Record<string, string>[] = []
  const unique = Array.from(new Set(values))
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data } = await supabase.from('leads').select(selectCols).in(column, chunk)
    if (data) found.push(...(data as unknown as Record<string, string>[]))
  }
  return found
}

type ChunkBody = { tier?: string; rows?: Record<string, string>[]; finalize?: boolean }

export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tier, rows, finalize }: ChunkBody = await req.json().catch(() => ({}))
  if (!tier || !isValidTier(tier)) {
    return NextResponse.json({ error: 'Invalid or missing tier' }, { status: 400 })
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: 'Missing rows' }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (rows.length === 0) {
    if (finalize) await syncAvailableCount(supabase, tier)
    return NextResponse.json({ inserted: 0, skipped: 0, tier })
  }

  // Map raw vendor columns -> BlyLeads fields using this chunk's headers.
  const headers = Object.keys(rows[0])
  const colMap = buildColumnMap(headers)
  const firstNameCol = colMap['__first_name__']
  const lastNameCol  = colMap['__last_name__']

  const mappedRows = rows.map(row => {
    const mapped: Record<string, string> = {}
    for (const [origKey, val] of Object.entries(row)) {
      const dbKey = colMap[origKey.trim()]
      if (dbKey && !dbKey.startsWith('__')) mapped[dbKey] = (val ?? '').toString().trim()
    }
    if (!mapped['contact_name'] && (firstNameCol || lastNameCol)) {
      const first = (firstNameCol ? row[firstNameCol]?.toString().trim() : '') || ''
      const last  = (lastNameCol  ? row[lastNameCol]?.toString().trim()  : '') || ''
      mapped['contact_name'] = [first, last].filter(Boolean).join(' ')
    }
    return mapped
  })

  // Scoped dedup: only check this chunk's source IDs and phones against the DB.
  const existingSourceIds = new Set<string>()
  ;(await existingValues(supabase, 'source_lead_id', 'source_lead_id', mappedRows.map(r => r['lead_id']).filter(Boolean)))
    .forEach(r => { if (r.source_lead_id) existingSourceIds.add(r.source_lead_id) })

  const existingNamePhone = new Set<string>()
  ;(await existingValues(supabase, 'primary_phone', 'contact_name, primary_phone', mappedRows.map(r => r['primary_phone']).filter(Boolean)))
    .forEach(r => {
      if (r.contact_name && r.primary_phone) existingNamePhone.add(`${r.contact_name.toLowerCase().trim()}|${r.primary_phone.trim()}`)
    })

  // Next sequential BLY id (chunks run in series, so this advances correctly).
  const { data: lastLead } = await supabase
    .from('leads').select('lead_id').like('lead_id', 'BLY-%')
    .order('lead_id', { ascending: false }).limit(1)
  let nextNum = 1
  if (lastLead && lastLead.length > 0) {
    const lastNum = parseInt(lastLead[0].lead_id.replace('BLY-', ''), 10)
    if (!isNaN(lastNum)) nextNum = lastNum + 1
  }

  const usedPhrases = new Set<string>()
  const toInsert = []
  let skipped = 0
  // Skipped DUPLICATE rows (original columns + reason), returned so the admin
  // can download exactly which leads were skipped. Blank rows aren't included.
  const skippedRows: Record<string, string>[] = []

  // Data Leads is a passthrough product: store each row's ORIGINAL columns
  // verbatim (in raw_data) and deliver them to agents exactly as uploaded,
  // rather than forcing the file into the fixed insurance schema. We still map
  // name + phone purely for dedup.
  const isPassthrough = tier === 'Data Leads'

  for (let idx = 0; idx < mappedRows.length; idx++) {
    const mapped = mappedRows[idx]
    if (!mapped['contact_name'] && !mapped['primary_phone'] && !mapped['lead_id']) { skipped++; continue }

    const sourceId = mapped['lead_id'] || null
    if (sourceId && existingSourceIds.has(sourceId)) {
      skipped++; skippedRows.push({ ...rows[idx], 'Skip Reason': 'Duplicate ID (already in system or earlier in file)' }); continue
    }

    const namePhoneKey = mapped['contact_name'] && mapped['primary_phone']
      ? `${mapped['contact_name'].toLowerCase().trim()}|${mapped['primary_phone'].trim()}`
      : null
    if (namePhoneKey && existingNamePhone.has(namePhoneKey)) {
      skipped++; skippedRows.push({ ...rows[idx], 'Skip Reason': 'Duplicate name + phone' }); continue
    }

    if (sourceId) existingSourceIds.add(sourceId)
    if (namePhoneKey) existingNamePhone.add(namePhoneKey)

    const leadId = `BLY-${String(nextNum++).padStart(6, '0')}`

    if (isPassthrough) {
      // Keep the original row exactly (minus any blank-named columns). jsonb
      // doesn't preserve key order, so store the ordered column list separately
      // (raw_columns) to reproduce the exact layout on download.
      const raw = Object.fromEntries(
        Object.entries(rows[idx]).filter(([k]) => k.trim() !== '')
      )
      toInsert.push({
        tier,
        lead_id:       leadId,
        contact_name:  mapped['contact_name'] || null, // dedup only
        primary_phone: mapped['primary_phone'] || null, // dedup only
        raw_data:      raw,
        raw_columns:   Object.keys(raw),
        auth_phrase:   uniquePhrase(usedPhrases),
        is_sold:       false,
      })
    } else {
      toInsert.push({
        tier,
        lead_id:               leadId,
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
  }

  let inserted = 0
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500)
    const { error } = await supabase.from('leads').insert(batch)
    if (error) return NextResponse.json({ error: `Insert failed: ${error.message}`, inserted, skipped }, { status: 500 })
    inserted += batch.length
  }

  if (finalize) await syncAvailableCount(supabase, tier)

  return NextResponse.json({ inserted, skipped, tier, skippedRows })
}

async function syncAvailableCount(supabase: ReturnType<typeof createAdminClient>, tier: string) {
  const { count } = await supabase
    .from('leads').select('*', { count: 'exact', head: true })
    .eq('tier', tier).eq('is_sold', false)
  await supabase.from('pricing').update({ available_count: count ?? 0 }).eq('tier', tier)
}
