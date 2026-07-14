import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { isValidTier, yearTier } from '@/lib/tiers'
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
  // Core mortgage-protection qualifying fields (only output on Core downloads).
  age:                   ['borrowerage','age'],
  smoker:                ['tobaccouser','borrowertobacco','tobacco','smoker','smokerstatus','nicotine'],
  co_borrower:           ['coborrower','coborrowername','cosigner'],
  health_conditions:     ['borrowermedicalissues','healthnotes','medicalissues','healthconditions','medicalconditions','healthissues'],
}

// Headers that carry the lead's generation date — used to route Core/Essential
// rows into their year tiers. Ordered by trust: explicit record/lead dates,
// then Titan's "Call In Time" (when the prospect called = lead generation),
// then closing date as a last resort. (Several of these are also in
// DROP_KEYWORDS: read from the raw row for routing, never stored on the lead.)
const DATE_KEYWORDS = [
  'recorddate', 'recordeddate', 'leaddate', 'dateadded', 'datecreated', 'createddate', 'creationdate',
  'callintime', 'calldate',
  'closingdate',
]

// Pull a plausible lead year out of a raw row: 4-digit 20xx first, then a
// trailing 2-digit year (e.g. 6/22/23) sanity-capped to 2015-2030. The
// 2-digit check uses only the date token so "10/20/18 12:15:22" works.
function detectYear(row: Record<string, string>): number | null {
  const byNorm: Record<string, string> = {}
  for (const [header, value] of Object.entries(row)) byNorm[norm(header)] = String(value ?? '').trim()
  for (const key of DATE_KEYWORDS) {
    const v = byNorm[key]
    if (!v) continue
    const four = v.match(/\b(20\d{2})\b/)
    if (four) return parseInt(four[1], 10)
    const two = v.split(/\s+/)[0].match(/[\/\-.](\d{2})$/)
    if (two) {
      const y = 2000 + parseInt(two[1], 10)
      if (y >= 2015 && y <= 2030) return y
    }
  }
  return null
}

const DROP_KEYWORDS = new Set([
  'gender','education','timezone','timzone','areacode','dob','dateofbirth','spanishspeaking','recorddate',
  'county','callintime','closingdate','lastaction',
  'phoneinaction','callinaction','callaction','action',
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
    if (finalize) await syncTierAndVariants(supabase, tier)
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
  // DB matches and in-file repeats are tracked separately so the skip reason
  // can say WHICH kind of duplicate each skipped row was.
  const dbSourceIds = new Set<string>()
  ;(await existingValues(supabase, 'source_lead_id', 'source_lead_id', mappedRows.map(r => r['lead_id']).filter(Boolean)))
    .forEach(r => { if (r.source_lead_id) dbSourceIds.add(r.source_lead_id) })

  const dbNamePhone = new Set<string>()
  ;(await existingValues(supabase, 'primary_phone', 'contact_name, primary_phone', mappedRows.map(r => r['primary_phone']).filter(Boolean)))
    .forEach(r => {
      if (r.contact_name && r.primary_phone) dbNamePhone.add(`${r.contact_name.toLowerCase().trim()}|${r.primary_phone.trim()}`)
    })

  const fileSourceIds = new Set<string>()
  const fileNamePhone = new Set<string>()

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
    if (sourceId && (dbSourceIds.has(sourceId) || fileSourceIds.has(sourceId))) {
      skipped++; skippedRows.push({ ...rows[idx], 'Skip Reason': dbSourceIds.has(sourceId)
        ? 'Duplicate ID — matches a lead already in the system'
        : 'Duplicate ID — appears earlier in this file' }); continue
    }

    const namePhoneKey = mapped['contact_name'] && mapped['primary_phone']
      ? `${mapped['contact_name'].toLowerCase().trim()}|${mapped['primary_phone'].trim()}`
      : null
    if (namePhoneKey && (dbNamePhone.has(namePhoneKey) || fileNamePhone.has(namePhoneKey))) {
      skipped++; skippedRows.push({ ...rows[idx], 'Skip Reason': dbNamePhone.has(namePhoneKey)
        ? 'Duplicate name + phone — matches a lead already in the system'
        : 'Duplicate name + phone — appears earlier in this file' }); continue
    }

    if (sourceId) fileSourceIds.add(sourceId)
    if (namePhoneKey) fileNamePhone.add(namePhoneKey)

    const leadId = `BLY-${String(nextNum++).padStart(6, '0')}`

    // Core/Essential rows route into their year tier by record date; other
    // tiers (and rows without a parseable date) keep the file's tier.
    const rowTier = isPassthrough ? tier : yearTier(tier, detectYear(rows[idx]))

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
        tier:                  rowTier,
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
        age:                   mapped['age'] || null,
        smoker:                mapped['smoker'] || null,
        co_borrower:           mapped['co_borrower'] || null,
        health_conditions:     mapped['health_conditions'] || null,
        auth_phrase:           uniquePhrase(usedPhrases),
        is_sold:               false,
      })
    }
  }

  let inserted = 0
  const tierCounts: Record<string, number> = {}
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500)
    const { error } = await supabase.from('leads').insert(batch)
    if (error) return NextResponse.json({ error: `Insert failed: ${error.message}`, inserted, skipped }, { status: 500 })
    inserted += batch.length
    for (const row of batch) tierCounts[row.tier] = (tierCounts[row.tier] || 0) + 1
  }

  if (finalize) await syncTierAndVariants(supabase, tier)

  return NextResponse.json({ inserted, skipped, tier, skippedRows, tierCounts })
}

// A Core/Essential upload can land rows in any of its year tiers, so sync
// them all (chunks may have routed rows this finalize call never saw).
async function syncTierAndVariants(supabase: ReturnType<typeof createAdminClient>, tier: string) {
  const tiers = tier === 'Core' || tier === 'Essential'
    ? [tier, `${tier} 2018-2020`, `${tier} 2021-2022`, `${tier} 2023`]
    : [tier]
  for (const t of tiers) await syncAvailableCount(supabase, t)
}

async function syncAvailableCount(supabase: ReturnType<typeof createAdminClient>, tier: string) {
  const { count } = await supabase
    .from('leads').select('*', { count: 'exact', head: true })
    .eq('tier', tier).eq('is_sold', false)
  await supabase.from('pricing').update({ available_count: count ?? 0 }).eq('tier', tier)
}
