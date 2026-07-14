import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tierLabel } from './tiers'

// DB column -> CSV/Excel header, in output order.
export const DB_TO_CSV: Record<string, string> = {
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

// Core mortgage-protection leads carry extra qualifying fields that only make
// sense for (and are only delivered on) the Core tiers. Appended to the right
// of the standard columns on Core downloads; never shown for other tiers.
const CORE_EXTRA: Record<string, string> = {
  age:               'Age',
  smoker:            'Smoker',
  co_borrower:       'Co-Borrower',
  health_conditions: 'Health Conditions',
}
// Includes retired tier names (e.g. 'Core 2023', merged into 'Core 2023-2025')
// so re-downloads of old orders keep their extra columns.
const CORE_TIERS = new Set(['Core', 'Core 2018-2020', 'Core 2021-2022', 'Core 2023', 'Core 2023-2025'])

type ExportOrder = { id: string; tier: string; quantity: number; agent_id: string }

// Builds the same multi-sheet workbook an agent downloads — one sheet per order
// tier — used by both the agent download and the admin "view assigned leads".
// Leads are fetched by order_id (exact), falling back to the legacy
// agent+tier+newest-N query for orders fulfilled before the order_id migration.
export async function buildLeadsWorkbook(
  supabase: SupabaseClient,
  orders: ExportOrder[]
): Promise<Uint8Array | null> {
  const workbook = XLSX.utils.book_new()

  for (const order of orders) {
    const { count: linkedCount } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id)
    const useLink = (linkedCount ?? 0) > 0

    const allLeads: Record<string, unknown>[] = []
    let page = 0
    const PAGE = 1000
    while (allLeads.length < order.quantity) {
      const remaining = order.quantity - allLeads.length
      let query = supabase.from('leads').select('*')
      if (useLink) {
        query = query.eq('order_id', order.id)
      } else {
        query = query.eq('sold_to', order.agent_id).eq('tier', order.tier).not('sold_at', 'is', null)
          .order('sold_at', { ascending: false })
      }
      const { data: chunk } = await query
        .order('id', { ascending: true })
        .range(page, page + Math.min(remaining, PAGE) - 1)
      if (!chunk || chunk.length === 0) break
      allLeads.push(...chunk)
      if (chunk.length < PAGE) break
      page += PAGE
    }

    if (allLeads.length === 0) continue

    let sheet
    if (order.tier === 'Data Leads') {
      // Passthrough: deliver the original uploaded columns verbatim, in their
      // original order (from raw_columns, since jsonb doesn't keep key order).
      // Union across leads preserves first-seen order and tolerates files with
      // slightly different columns.
      const cols: string[] = []
      const seen = new Set<string>()
      for (const lead of allLeads) {
        const l = lead as Record<string, unknown>
        const order = Array.isArray(l.raw_columns)
          ? (l.raw_columns as string[])
          : Object.keys((l.raw_data ?? {}) as Record<string, unknown>)
        for (const k of order) if (!seen.has(k)) { seen.add(k); cols.push(k) }
      }
      const rows = allLeads.map(lead => {
        const raw = ((lead as Record<string, unknown>).raw_data ?? {}) as Record<string, unknown>
        return cols.map(c => raw[c] ?? '')
      })
      sheet = XLSX.utils.aoa_to_sheet([cols, ...rows])
    } else {
      // Core tiers get the extra qualifying columns appended; others don't.
      const colMap = CORE_TIERS.has(order.tier) ? { ...DB_TO_CSV, ...CORE_EXTRA } : DB_TO_CSV
      const entries = Object.entries(colMap) // [dbKey, header] in output order
      const headers = entries.map(([, header]) => header)
      const rows = allLeads.map(lead =>
        entries.map(([dbKey]) => {
          const val = (lead as Record<string, unknown>)[dbKey]
          // Show the display label (e.g. "Apex Core") in the List Code column.
          return dbKey === 'tier' ? tierLabel(String(val ?? '')) : (val ?? '')
        })
      )
      sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    }
    XLSX.utils.book_append_sheet(workbook, sheet, tierLabel(order.tier).slice(0, 31))
  }

  if (workbook.SheetNames.length === 0) return null
  return new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}
