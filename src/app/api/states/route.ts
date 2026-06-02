import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tier = req.nextUrl.searchParams.get('tier')
  if (!tier) return NextResponse.json({ error: 'Missing tier' }, { status: 400 })

  const adminSupabase = createAdminClient()
  const { data: leads } = await adminSupabase
    .from('leads')
    .select('state')
    .eq('tier', tier)
    .eq('is_sold', false)
    .not('state', 'is', null)

  if (!leads) return NextResponse.json([])

  const counts: Record<string, number> = {}
  for (const lead of leads) {
    const s = lead.state?.trim().toUpperCase()
    if (s) counts[s] = (counts[s] || 0) + 1
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([state, count]) => ({ state, count }))

  return NextResponse.json(sorted)
}
