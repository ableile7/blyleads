import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Order = {
  id: string
  tier: string
  quantity: number
  total_amount: number
  status: string
  created_at: string
  stripe_session_id: string
  download_token: string | null
  downloaded_at: string | null
}

export default async function OrdersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1F3864] text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">BlyLeads</h1>
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="text-sm text-blue-200 hover:text-white transition">Dashboard</a>
          <a href="/api/auth/signout" className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
            Sign Out
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-800 mb-8">Order History</h2>

        {sessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400">No orders yet.</p>
            <a href="/dashboard" className="mt-4 inline-block text-[#1F3864] font-semibold text-sm hover:underline">
              Browse leads →
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map(sessionOrders => {
              const first = sessionOrders[0]
              const totalLeads = sessionOrders.reduce((s, o) => s + o.quantity, 0)
              const totalAmount = sessionOrders.reduce((s, o) => s + Number(o.total_amount), 0)
              const allPaid = sessionOrders.every(o => o.status === 'paid')
              const anyPending = sessionOrders.some(o => o.status === 'pending')
              const downloadToken = first.download_token
              const wasDownloaded = sessionOrders.some(o => o.downloaded_at)

              return (
                <div key={first.stripe_session_id || first.id} className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {sessionOrders.map(o => <TierBadge key={o.id} tier={o.tier} />)}
                        <StatusBadge status={allPaid ? 'paid' : anyPending ? 'pending' : 'failed'} />
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {totalLeads} lead{totalLeads !== 1 ? 's' : ''} across {sessionOrders.length} tier{sessionOrders.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(first.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <p className="font-bold text-gray-800 text-lg">${totalAmount.toFixed(2)}</p>
                      {allPaid && downloadToken && (
                        <a
                          href={`/api/download?token=${downloadToken}`}
                          className="bg-[#1F3864] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#2a4a80] transition"
                        >
                          {wasDownloaded ? 'Re-Download' : 'Download Excel'}
                        </a>
                      )}
                    </div>
                  </div>

                  {sessionOrders.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-gray-50 space-y-1">
                      {sessionOrders.map(o => (
                        <div key={o.id} className="flex items-center justify-between text-xs text-gray-500">
                          <span>{o.tier}: {o.quantity} leads</span>
                          <span>${Number(o.total_amount).toFixed(2)}</span>
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
    Prime:   'bg-[#e8f0f8] text-[#1F3864]',
    Select:  'bg-[#eaf2e4] text-[#2d4a1e]',
    Premier: 'bg-[#f5eaf2] text-[#4a1e3a]',
  }
  return (
    <span className={`text-xs font-bold px-3 py-1 rounded-full ${styles[tier] || 'bg-gray-100 text-gray-600'}`}>
      {tier}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid:    'text-green-600',
    pending: 'text-yellow-600',
    failed:  'text-red-500',
  }
  return <span className={`text-xs font-semibold capitalize ${styles[status] || 'text-gray-400'}`}>{status}</span>
}
