import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tier, price_per_lead, elg_price_per_lead, available_count, is_active } = await req.json()
  const supabase = createAdminClient()
  await supabase.from('pricing').update({ price_per_lead, elg_price_per_lead, available_count, is_active }).eq('tier', tier)
  return NextResponse.json({ ok: true })
}
