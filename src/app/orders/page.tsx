import { createClient } from '@/lib/supabase/server'
import { tierLabel } from '@/lib/tiers'
import { redirect } from 'next/navigation'

type Order = {
  id: string
  tier: string
  quantity: number
  total_amount: number
  amount_collected: number | null
  status: string
  created_at: string
  stripe_session_id: string
  download_token: string | null
  downloaded_at: string | null
}

// What the agent was actually charged (list price + 3% fee − any promo discount).
// Falls back to list price for pending orders not yet charged / legacy orders.
const collected = (o: Order) => Number(o.amount_collected ?? o.total_amount)

export default async function OrdersPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const errorMessages: Record<string, string> = {
    not_ready: 'Your leads are still being prepared. Please try again in a moment.',
    no_leads: 'No leads were found for this order. Please contact support.',
    missing_token: 'Invalid download link. Please use the button below.',
  }
  const errorMsg = searchParams.error ? errorMessages[searchParams.error] : null

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('agent_id', user.id)
    .order('created_at', { ascending: false })

  // Group orders by stripe_session_id
  const sessionMap = new Map<string, Order[]>()
  for (const order of (orders || [])) {
    const key = order.stripe_session_id || order.id
    if (!sessionMap.has(key)) sessionMap.set(key, [])
    sessionMap.get(key)!.push(order)
  }
  const sessions = Array.from(sessionMap.values())

  return (
    <div className="min-h-screen bg-ambient">
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#04070e]/70 border-b border-white/10 text-white px-6 py-3 flex items-center justify-between">
        <img src="/logo.png" alt="BlyLeads" className="h-10" />
        <div className="flex items-center gap-5">
          <a href="/dashboard" className="text-sm text-slate-300 hover:text-white transition">Dashboard</a>
          <a href="/api/auth/signout" className="text-sm bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/25 px-4 py-1.5 rounded-lg transition">
            Sign Out
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <p className="label-premium mb-2">Account</p>
        <h2 className="text-3xl font-bold text-chrome tracking-wide mb-8">Order History</h2>

        {errorMsg && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-4 mb-6 text-sm text-yellow-300">
            {errorMsg}
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-slate-400">No orders yet.</p>
            <a href="/dashboard" className="mt-4 inline-block text-[#7eb3ff] font-semibold text-sm hover:text-white transition">
              Browse leads →
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map(sessionOrders => {
              const first = sessionOrders[0]
              const totalLeads = sessionOrders.reduce((s, o) => s + o.quantity, 0)
              const totalAmount = sessionOrders.reduce((s, o) => s + collected(o), 0)
              const allPaid = sessionOrders.every(o => o.status === 'paid')
              const anyPending = sessionOrders.some(o => o.status === 'pending')
              const downloadToken = first.download_token
              const wasDownloaded = sessionOrders.some(o => o.downloaded_at)

              return (
                <div key={first.stripe_session_id || first.id} className="glass-card p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {sessionOrders.map(o => <TierBadge key={o.id} tier={o.tier} />)}
                        <StatusBadge status={allPaid ? 'paid' : anyPending ? 'pending' : 'failed'} />
                      </div>
                      <p className="text-sm text-slate-300 mt-1">
                        {totalLeads} lead{totalLeads !== 1 ? 's' : ''} across {sessionOrders.length} tier{sessionOrders.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(first.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <p className="font-bold text-chrome text-lg">${totalAmount.toFixed(2)}</p>
                      {allPaid && downloadToken && (
                        <a
                          href={`/api/download?token=${downloadToken}`}
                          className="btn-premium text-white text-sm font-semibold px-4 py-2 rounded-lg"
                        >
                          {wasDownloaded ? 'Re-Download' : 'Download Excel'}
                        </a>
                      )}
                    </div>
                  </div>

                  {sessionOrders.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
                      {sessionOrders.map(o => (
                        <div key={o.id} className="flex items-center justify-between text-xs text-slate-500">
                          <span>{o.tier}: {o.quantity} leads</span>
                          <span>${collected(o).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    Prime:     'bg-[#1a3a7a]/80 text-[#7eb3ff] border border-[#2d5a9e]/50',
    Select:    'bg-[#0f2b14]/80 text-[#7ecc8f] border border-[#2d7a3e]/50',
    Premier:   'bg-[#2a0f2e]/80 text-[#d47ef0] border border-[#7a2d9e]/50',
    Core:      'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    Essential: 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    'Data Leads': 'bg-[#06201d]/80 text-[#5fd4c4] border border-[#0f766e]/50',
    'Core 2018-2020': 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    'Core 2021-2022': 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    'Core 2023': 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    'Essential 2018-2020': 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    'Essential 2021-2022': 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    'Essential 2023': 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    'Core 2024-2025': 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    'Essential 2024-2025': 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    Apex: 'bg-gradient-to-r from-[#3a2900] to-[#5c4200] text-[#ffd24a] border border-[#e0b020]/70',
    'A-Tier': 'bg-gradient-to-r from-[#23272d] to-[#363c44] text-[#e2e8f0] border border-[#828b96]/60',
  }
  return (
    <span className={`text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full ${styles[tier] || 'bg-white/10 text-slate-300'}`}>
      {tierLabel(tier)}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid:    'text-green-400',
    pending: 'text-yellow-400',
    failed:  'text-red-400',
  }
  return <span className={`text-xs font-semibold capitalize ${styles[status] || 'text-slate-400'}`}>{status}</span>
}
