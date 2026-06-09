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

  const counts: Record<string, number> = {}
  let page = 0
  const PAGE = 1000
  while (true) {
    const { data } = await adminSupabase
      .from('leads')
      .select('state')
      .eq('tier', tier)
      .eq('is_sold', false)
      .not('state', 'is', null)
      .range(page, page + PAGE - 1)
    if (!data || data.length === 0) break
    for (const lead of data) {
      const s = lead.state?.trim().toUpperCase()
      if (s) counts[s] = (counts[s] || 0) + 1
    }
    if (data.length < PAGE) break
    page += PAGE
  }

  if (Object.keys(counts).length === 0) return NextResponse.json([])

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([state, count]) => ({ state, count }))

  return NextResponse.json(sorted)
}
