import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { agentId, status, agency } = await req.json()
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })
  // Only touch the fields the caller sent (status change vs ELG-tag toggle).
  const patch: Record<string, unknown> = {}
  if (status !== undefined) patch.status = status
  if (agency !== undefined) patch.agency = agency
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const supabase = createAdminClient()
  await supabase.from('agents').update(patch).eq('id', agentId)
  return NextResponse.json({ ok: true })
}
