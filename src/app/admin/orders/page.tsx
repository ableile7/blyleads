import { createAdminClient } from '@/lib/supabase/server'
import FulfillButton from './FulfillButton'

export default async function AdminOrdersPage() {
  const supabase = createAdminClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('*, agents(full_name, email)')
    .order('created_at', { ascending: false })

  const totalRevenue = orders?.filter(o => o.status === 'paid')
    .reduce((sum, o) => sum + Number(o.total_amount), 0) ?? 0

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-gray-800">All Orders</h2>
        <div className="bg-white border border-gray-100 rounded-xl px-5 py-3 text-right">
          <p className="text-xs text-gray-500">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-800">${totalRevenue.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Agent', 'Tier', 'Qty', 'Total', 'Status', 'Date', 'Downloaded', ''].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orders?.map(order => (
              <tr key={order.id} className="hover:bg-gray-50 transition">
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-800">{order.agents?.full_name}</p>
                  <p className="text-xs text-gray-400">{order.agents?.email}</p>
                </td>
                <td className="px-5 py-4"><TierBadge tier={order.tier} /></td>
                <td className="px-5 py-4 text-gray-700">{order.quantity}</td>
                <td className="px-5 py-4 font-semibold text-gray-800">${Number(order.total_amount).toFixed(2)}</td>
                <td className="px-5 py-4">
                  <span className={`text-xs font-semibold capitalize ${
                    order.status === 'paid' ? 'text-green-600' :
                    order.status === 'failed' ? 'text-red-500' : 'text-yellow-600'
                  }`}>{order.status}</span>
                </td>
                <td className="px-5 py-4 text-gray-500 text-xs">
                  {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-5 py-4 text-xs text-gray-400">
                  {order.downloaded_at
                    ? new Date(order.downloaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—'}
                </td>
                <td className="px-5 py-4">
                  {order.status === 'pending' && (
                    <FulfillButton orderId={order.id} />
                  )}
                </td>
              </tr>
            ))}
            {(!orders || orders.length === 0) && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">No orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    Prime:   'bg-[#e8f0f8] text-[#1F3864]',
    Select:  'bg-[#eaf2e4] text-[#2d4a1e]',
    Premier: 'bg-[#f5eaf2] text-[#4a1e3a]',
  }
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${styles[tier] || 'bg-gray-100 text-gray-600'}`}>{tier}</span>
}
