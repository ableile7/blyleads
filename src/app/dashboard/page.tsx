import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardCart from './DashboardCart'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: pricing } = await supabase
    .from('pricing')
    .select('*')
    .eq('is_active', true)
    .order('tier')

  // ELG (in-agency) agents see the tier's ELG price where one is set; the
  // cart and checkout then use that price everywhere automatically. ELG
  // prices live in the service-role-only pricing_elg table, fetched here on
  // the server — non-ELG agents never receive them.
  const elgPrices: Record<string, number> = {}
  if (agent?.agency === 'ELG') {
    const { data: elg } = await createAdminClient().from('pricing_elg').select('*')
    for (const row of elg || []) elgPrices[row.tier] = Number(row.price_per_lead)
  }
  const tiers = (pricing || []).map(p => ({
    ...p,
    price_per_lead: elgPrices[p.tier] ?? p.price_per_lead,
  }))

  return (
    <div className="min-h-screen bg-ambient">
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#04070e]/70 border-b border-white/10 text-white px-6 py-3 flex items-center justify-between">
        <img src="/logo.png" alt="BlyLeads" className="h-10" />
        <div className="flex items-center gap-5">
          <span className="text-slate-400 text-sm hidden sm:block">{agent?.full_name}</span>
          <a href="/orders" className="text-sm text-slate-300 hover:text-white transition">Orders</a>
          <a href="/api/auth/signout" className="text-sm bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/25 px-4 py-1.5 rounded-lg transition">
            Sign Out
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Promo: Mortgage Protection Data Leads (sold direct, text Alex) */}
        <div className="mb-10 rounded-2xl border border-[#0f766e]/50 bg-gradient-to-r from-[#06201d]/90 to-[#08231f]/60 px-6 py-5 shadow-[0_0_50px_-14px_rgba(20,184,166,0.45)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[#5fd4c4] font-bold text-lg tracking-wide">📲 Mortgage Protection Data Leads — Available Now</p>
              <p className="text-slate-300 text-sm mt-1.5">
                <span className="font-semibold text-white">$0.30/lead</span>
                <span className="text-slate-500"> · </span>
                States: <span className="font-semibold text-white">MO, IL, IN, KY, OK</span>
                <span className="text-slate-500"> · </span>
                <span className="italic">Bulk discounts available</span>
              </p>
            </div>
            <a
              href="sms:+14198893444"
              className="shrink-0 text-center bg-[#0f766e] hover:bg-[#13988c] text-white font-semibold text-sm px-5 py-3 rounded-xl transition whitespace-nowrap shadow-[0_0_30px_-8px_rgba(20,184,166,0.6)]"
            >
              Text Alex · (419) 889-3444
            </a>
          </div>
        </div>

        <p className="label-premium mb-2">Marketplace</p>
        <h2 className="text-3xl font-bold text-chrome tracking-wide mb-2">Available Leads</h2>
        <p className="text-slate-400 text-sm mb-10">Enter quantities by state for any tier, then purchase all at once.</p>

        <DashboardCart tiers={tiers} />
      </main>
    </div>
  )
}
