import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function OrdersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('agent_id', user.id)
    .order('created_at', { ascending: false })

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

        {!orders || orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400">No orders yet.</p>
            <a href="/dashboard" className="mt-4 inline-block text-[#1F3864] font-semibold text-sm hover:underline">
              Browse leads →
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <TierBadge tier={order.tier} />
                  <div>
                    <p className="font-semibold text-gray-800">{order.quantity} leads</p>
                    <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-800">${order.total_amount.toFixed(2)}</p>
                  <StatusBadge status={order.status} />
                </div>
                {order.status === 'paid' && order.download_token && (
                  <a
                    href={`/api/download?token=${order.download_token}`}
                    className="shrink-0 bg-[#1F3864] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#2a4a80] transition"
                  >
                    {order.downloaded_at ? 'Re-Download' : 'Download CSV'}
                  </a>
                )}
              </div>
            ))}
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
