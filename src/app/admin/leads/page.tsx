import { createAdminClient } from '@/lib/supabase/server'

const TIERS = ['Apex', 'Select', 'Prime', 'Premier', 'Essential', 'Core', 'Core 2018-2020', 'Core 2021-2022', 'Core 2023', 'Data Leads']

export default async function AdminLeadsPage() {
  const supabase = createAdminClient()

  const stats = await Promise.all(TIERS.map(async tier => {
    const [{ count: total }, { count: available }, { count: sold }] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('tier', tier),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('tier', tier).eq('is_sold', false),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('tier', tier).eq('is_sold', true),
    ])
    return { tier, total: total ?? 0, available: available ?? 0, sold: sold ?? 0 }
  }))

  const TIER_STYLES: Record<string, { badge: string; bar: string }> = {
    Prime:     { badge: 'bg-[#1F3864] text-white', bar: 'bg-[#3b7abf]' },
    Select:    { badge: 'bg-[#2d4a1e] text-white', bar: 'bg-[#5a9e3a]' },
    Premier:   { badge: 'bg-[#4a1e3a] text-white', bar: 'bg-[#9e3a7a]' },
    Core:      { badge: 'bg-[#4a3a00] text-yellow-300', bar: 'bg-yellow-500' },
    Essential: { badge: 'bg-[#2a2a2a] text-gray-300', bar: 'bg-gray-400' },
    'Data Leads': { badge: 'bg-[#0f5a52] text-white', bar: 'bg-[#14b8a6]' },
    'Core 2018-2020': { badge: 'bg-[#4a3a00] text-yellow-300', bar: 'bg-yellow-500' },
    'Core 2021-2022': { badge: 'bg-[#4a3a00] text-yellow-300', bar: 'bg-yellow-500' },
    'Core 2023': { badge: 'bg-[#4a3a00] text-yellow-300', bar: 'bg-yellow-500' },
    Apex: { badge: 'bg-[#5c4200] text-amber-200', bar: 'bg-amber-400' },
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-8">Lead Inventory</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {stats.map(s => {
          const c = TIER_STYLES[s.tier]
          const soldPct = s.total > 0 ? Math.round((s.sold / s.total) * 100) : 0
          return (
            <div key={s.tier} className="bg-white rounded-2xl border border-gray-100 p-6">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${c.badge}`}>{s.tier}</span>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="font-semibold text-gray-800">{s.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Available</span>
                  <span className="font-semibold text-green-600">{s.available}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Sold</span>
                  <span className="font-semibold text-gray-800">{s.sold}</span>
                </div>
              </div>
              <div className="mt-4">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${soldPct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{soldPct}% sold</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
