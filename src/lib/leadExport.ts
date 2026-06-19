import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'

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
      // Passthrough: deliver the original uploaded columns verbatim. Build the
      // header from the union of raw_data keys (preserving first-seen order) so
      // it works even if rows came from files with slightly different columns.
      const cols: string[] = []
      const seen = new Set<string>()
      for (const lead of allLeads) {
        const raw = ((lead as Record<string, unknown>).raw_data ?? {}) as Record<string, unknown>
        for (const k of Object.keys(raw)) if (!seen.has(k)) { seen.add(k); cols.push(k) }
      }
      const rows = allLeads.map(lead => {
        const raw = ((lead as Record<string, unknown>).raw_data ?? {}) as Record<string, unknown>
        return cols.map(c => raw[c] ?? '')
      })
      sheet = XLSX.utils.aoa_to_sheet([cols, ...rows])
    } else {
      const rows = allLeads.map(lead =>
        COLUMNS.map(col => {
          const dbKey = Object.entries(DB_TO_CSV).find(([, v]) => v === col)?.[0]
          return dbKey ? ((lead as Record<string, unknown>)[dbKey] ?? '') : ''
        })
      )
      sheet = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
    }
    XLSX.utils.book_append_sheet(workbook, sheet, order.tier)
  }

  if (workbook.SheetNames.length === 0) return null
  return new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}
