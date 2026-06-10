import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardCart from './DashboardCart'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: agent } = await supabase
    .from('agents')
    .select('full_name, status')
    .eq('id', user.id)
    .single()

  const { data: pricing } = await supabase
    .from('pricing')
    .select('*')
    .eq('is_active', true)
    .order('tier')

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
        <p className="label-premium mb-2">Marketplace</p>
        <h2 className="text-3xl font-bold text-chrome tracking-wide mb-2">Available Leads</h2>
        <p className="text-slate-400 text-sm mb-10">Enter quantities by state for any tier, then purchase all at once.</p>

        <DashboardCart tiers={pricing || []} />
      </main>
    </div>
  )
}
