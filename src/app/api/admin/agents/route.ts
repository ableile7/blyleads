import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { agentId, status } = await req.json()
  const supabase = createAdminClient()
  await supabase.from('agents').update({ status }).eq('id', agentId)
  return NextResponse.json({ ok: true })
}
