import type { SupabaseClient } from '@supabase/supabase-js'

// Supabase caps every select at 1000 rows regardless of .limit(), so paginate.
export async function fetchAvailableLeadIds(
  supabase: SupabaseClient,
  tier: string,
  states: string[] | null,
  quantity: number
): Promise<string[]> {
  const ids: string[] = []
  let page = 0
  while (ids.length < quantity) {
    let query = supabase
      .from('leads')
      .select('id')
      .eq('tier', tier)
      .eq('is_sold', false)
      .order('id')
      .range(page * 1000, page * 1000 + 999)
    if (states && states.length > 0) query = query.in('state', states)

    const { data, error } = await query
    if (error || !data || data.length === 0) break
    ids.push(...data.map((l: { id: string }) => l.id))
    if (data.length < 1000) break
    page++
  }
  return ids.slice(0, quantity)
}

// .in('id', ids) puts every UUID in the request URL; large orders exceed URL
// limits and the update fails. Chunk to stay safely under.
export async function markLeadsSold(
  supabase: SupabaseClient,
  leadIds: string[],
  agentId: string,
  soldAt: string
): Promise<{ message: string } | null> {
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200)
    const { error } = await supabase
      .from('leads')
      .update({ is_sold: true, sold_to: agentId, sold_at: soldAt })
      .in('id', chunk)
    if (error) return error
  }
  return null
}
