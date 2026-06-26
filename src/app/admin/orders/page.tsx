import { createAdminClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import { tierLabel } from '@/lib/tiers'
import FulfillButton from './FulfillButton'
import ClearUnpaidButton from './ClearUnpaidButton'
import ExportOrdersButton, { type ExportRow } from './ExportOrdersButton'

// Effective price per lead after any promo discount (amount_collected already
// reflects the discount; strip the 3% fee, ÷ quantity). Equals the list rate
// when no discount was used.
function effectivePerLead(o: Order): number {
  if (o.amount_collected == null || !o.quantity) return Number(o.price_per_lead)
  return Math.round(((Number(o.amount_collected) - 0.03 * Number(o.total_amount)) / o.quantity) * 100) / 100
}

type Order = {
  id: string
  tier: string
  quantity: number
  price_per_lead: number
  total_amount: number
  amount_collected: number | null
  status: string
  created_at: string
  stripe_session_id: string
  downloaded_at: string | null
  agents?: { full_name: string; email: string }
}

// What Stripe actually charged (list price + fee - discount). Falls back to the
// list price for orders fulfilled before amount_collected was recorded.
const collected = (o: Order) => Number(o.amount_collected ?? o.total_amount)

export default async function AdminOrdersPage() {
  const supabase = createAdminClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('*, agents(full_name, email)')
    .order('created_at', { ascending: false })

  const totalRevenue = orders?.filter(o => o.status === 'paid')
    .reduce((sum, o) => sum + collected(o), 0) ?? 0

  // Group by stripe_session_id
  const sessionMap = new Map<string, Order[]>()
  for (const order of (orders || [])) {
    const key = order.stripe_session_id || order.id
    if (!sessionMap.has(key)) sessionMap.set(key, [])
    sessionMap.get(key)!.push(order)
  }
  const sessions = Array.from(sessionMap.values())

  // The local 'pending' status can't distinguish "never paid" (abandoned checkout)
  // from "paid but webhook didn't fulfill". Ask Stripe — the source of truth — for
  // the real payment status of every pending session, so Fulfill only ever appears
  // (and only ever works) once payment has actually processed.
  const pendingSessionIds = sessions
    .filter(group => group.some(o => o.status === 'pending'))
    .map(group => group[0].stripe_session_id)
    .filter((id): id is string => !!id && id.startsWith('cs_'))

  const paidSessions = new Set<string>()
  await Promise.all(pendingSessionIds.map(async (sid) => {
    try {
      const s = await stripe.checkout.sessions.retrieve(sid)
      if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') {
        paidSessions.add(sid)
      }
    } catch {
      // Treat unverifiable sessions as unpaid — never offer to fulfill them.
    }
  }))

  // Unpaid = pending sessions Stripe did NOT confirm as paid (abandoned checkouts).
  const unpaidCount = sessions.filter(group => {
    const sid = group[0].stripe_session_id
    return group.some(o => o.status === 'pending') && !(sid && paidSessions.has(sid))
  }).length

  // One export row per session, mirroring the table.
  const exportRows: ExportRow[] = sessions.map(group => {
    const first = group[0]
    const allPaid = group.every(o => o.status === 'paid')
    const anyPending = group.some(o => o.status === 'pending')
    const sid = first.stripe_session_id
    const needsFulfillment = anyPending && !!sid && paidSessions.has(sid)
    return {
      agent: first.agents?.full_name ?? '',
      email: first.agents?.email ?? '',
      tiers: Array.from(new Set(group.map(o => o.tier))).join('; '),
      leads: group.reduce((s, o) => s + o.quantity, 0),
      priceList: Array.from(new Set(group.map(o => Number(o.price_per_lead).toFixed(2)))).join('; '),
      priceAfterDiscount: Array.from(new Set(group.map(o => effectivePerLead(o).toFixed(2)))).join('; '),
      total: group.reduce((s, o) => s + collected(o), 0).toFixed(2),
      status: allPaid ? 'paid' : needsFulfillment ? 'paid · unfulfilled' : anyPending ? 'unpaid' : 'failed',
      date: first.created_at,
      downloaded: group.find(o => o.downloaded_at)?.downloaded_at ?? '',
      sessionId: sid ?? '',
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-gray-800">All Orders</h2>
        <div className="flex items-center gap-3">
          <ExportOrdersButton rows={exportRows} />
          {unpaidCount > 0 && <ClearUnpaidButton count={unpaidCount} />}
          <div className="bg-white border border-gray-100 rounded-xl px-5 py-3 text-right">
            <p className="text-xs text-gray-500">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-800">${totalRevenue.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Agent', 'Tiers', 'Leads', '$/Lead', 'Total', 'Status', 'Date', 'Downloaded', ''].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sessions.map(sessionOrders => {
              const first = sessionOrders[0]
              const totalLeads = sessionOrders.reduce((s, o) => s + o.quantity, 0)
              const totalAmount = sessionOrders.reduce((s, o) => s + collected(o), 0)
              const allPaid = sessionOrders.every(o => o.status === 'paid')
              const anyPending = sessionOrders.some(o => o.status === 'pending')
              const sid = first.stripe_session_id
              const stripePaid = !!sid && paidSessions.has(sid)
              // Payment confirmed by Stripe but leads not yet assigned → safe to fulfill.
              const needsFulfillment = anyPending && stripePaid
              const status = allPaid ? 'paid'
                : needsFulfillment ? 'paid · unfulfilled'
                : anyPending ? 'unpaid'
                : 'failed'
              const wasDownloaded = sessionOrders.some(o => o.downloaded_at)
              const hasPaidLeads = sessionOrders.some(o => o.status === 'paid')
              // Price per lead. List rate is price_per_lead; the EFFECTIVE rate
              // after any promo discount is derived from amount_collected (which
              // already reflects the discount) minus the 3% processing fee, ÷
              // quantity. With no discount the two are equal. Dedupe by list rate
              // so mixed-tier sessions show each distinct rate.
              const perLeadCells = Array.from(
                new Map(sessionOrders.map(o => {
                  const list = Number(o.price_per_lead)
                  const eff = effectivePerLead(o)
                  return [`${list}_${eff}`, { list, eff }]
                })).values()
              )

              return (
                <tr key={first.stripe_session_id || first.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">{first.agents?.full_name}</p>
                    <p className="text-xs text-gray-400">{first.agents?.email}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {sessionOrders.map(o => <TierBadge key={o.id} tier={o.tier} />)}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-700">{totalLeads}</td>
                  <td className="px-5 py-4 text-gray-700">
                    <div className="flex flex-col gap-0.5">
                      {perLeadCells.map((c, i) => c.eff < c.list - 0.005 ? (
                        <span key={i}>
                          <span className="font-semibold text-green-700">${c.eff.toFixed(2)}</span>{' '}
                          <span className="text-gray-300 line-through">${c.list.toFixed(2)}</span>
                        </span>
                      ) : (
                        <span key={i}>${c.list.toFixed(2)}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-semibold text-gray-800">${totalAmount.toFixed(2)}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-semibold capitalize ${
                      status === 'paid' ? 'text-green-600' :
                      status === 'failed' ? 'text-red-500' :
                      status === 'unpaid' ? 'text-gray-400' : 'text-yellow-600'
                    }`}>{status}</span>
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {new Date(first.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400">
                    {wasDownloaded
                      ? new Date(sessionOrders.find(o => o.downloaded_at)!.downloaded_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3 justify-end">
                      {hasPaidLeads && sid && (
                        <a
                          href={`/api/admin/order-leads?sessionId=${encodeURIComponent(sid)}`}
                          className="text-xs font-semibold text-[#1F3864] hover:underline whitespace-nowrap"
                        >
                          ↓ Leads
                        </a>
                      )}
                      {needsFulfillment && (
                        <FulfillButton sessionId={first.stripe_session_id} />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {sessions.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-gray-400">No orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    Prime:     'bg-[#e8f0f8] text-[#1F3864]',
    Select:    'bg-[#eaf2e4] text-[#2d4a1e]',
    Premier:   'bg-[#f5eaf2] text-[#4a1e3a]',
    Core:      'bg-[#fbf3d9] text-[#6b5500]',
    Essential: 'bg-[#eef1f4] text-[#3a4452]',
    'Data Leads': 'bg-[#d6f3ef] text-[#0f5a52]',
    'Core 2018-2020': 'bg-[#fbf3d9] text-[#6b5500]',
    'Core 2021-2022': 'bg-[#fbf3d9] text-[#6b5500]',
    'Core 2023': 'bg-[#fbf3d9] text-[#6b5500]',
    Apex: 'bg-gradient-to-r from-[#fff1c2] to-[#ffe49a] text-[#7a5800]',
    'A-Tier': 'bg-gradient-to-r from-[#eceef1] to-[#d3d8de] text-[#3c434b]',
  }
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${styles[tier] || 'bg-gray-100 text-gray-600'}`}>{tierLabel(tier)}</span>
}
