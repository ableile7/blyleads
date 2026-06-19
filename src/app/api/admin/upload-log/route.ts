import { createAdminClient } from '@/lib/supabase/server'
import { isAdminAuthed } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'

// Records one upload-history row per completed file (the client calls this once
// all of a file's chunks have finished). Best-effort: failures here never block
// the upload itself.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { filename, tier, inserted, skipped } = await req.json().catch(() => ({}))
  if (!filename) return NextResponse.json({ error: 'Missing filename' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('upload_batches').insert({
    filename,
    tier: tier ?? null,
    inserted: Number(inserted) || 0,
    skipped: Number(skipped) || 0,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
