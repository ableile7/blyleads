import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tier, price_per_lead, elg_price_per_lead, available_count, is_active } = await req.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('pricing').update({ price_per_lead, available_count, is_active }).eq('tier', tier)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ELG price lives in the service-role-only pricing_elg table; blank clears it.
  const { error: elgError } = elg_price_per_lead == null
    ? await supabase.from('pricing_elg').delete().eq('tier', tier)
    : await supabase.from('pricing_elg').upsert({ tier, price_per_lead: elg_price_per_lead })
  if (elgError) {
    return NextResponse.json({ error: `ELG price not saved — has migration 013 been applied? (${elgError.message})` }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
