import { createAdminClient } from '@/lib/supabase/server'

export default async function AdminOverviewPage() {
  const supabase = createAdminClient()

  const [
    { count: totalAgents },
    { count: pendingAgents },
    { count: totalLeads },
    { count: soldLeads },
    { data: orders },
  ] = await Promise.all([
    supabase.from('agents').select('*', { count: 'exact', head: true }),
    supabase.from('agents').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('is_sold', true),
    supabase.from('orders').select('total_amount, amount_collected').eq('status', 'paid'),
  ])

  // Use what Stripe actually collected (list price + fee - discount), falling
  // back to list price for any legacy order without amount_collected recorded.
  const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.amount_collected ?? o.total_amount), 0) ?? 0

  const stats = [
    { label: 'Total Agents', value: totalAgents ?? 0 },
    { label: 'Pending Approval', value: pendingAgents ?? 0, alert: (pendingAgents ?? 0) > 0 },
    { label: 'Total Leads', value: totalLeads ?? 0 },
    { label: 'Leads Sold', value: soldLeads ?? 0 },
    { label: 'Available Leads', value: (totalLeads ?? 0) - (soldLeads ?? 0) },
    { label: 'Total Revenue', value: `$${totalRevenue.toFixed(2)}` },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-8">Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        {stats.map(s => (
          <div key={s.label} className={`bg-white rounded-2xl border p-6 ${s.alert ? 'border-amber-400 bg-amber-50' : 'border-gray-100'}`}>
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.alert ? 'text-amber-600' : 'text-gray-800'}`}>{s.value}</p>
            {s.alert && <p className="text-xs text-amber-600 mt-1 font-semibold">Needs attention →</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { href: '/admin/agents', label: 'Manage Agents', desc: 'Approve or reject pending agents' },
          { href: '/admin/upload', label: 'Upload Leads', desc: 'Add new CSV lead batches' },
          { href: '/admin/pricing', label: 'Set Pricing', desc: 'Update price per lead per tier' },
          { href: '/admin/leads', label: 'Lead Inventory', desc: 'View available and sold counts' },
          { href: '/admin/orders', label: 'All Orders', desc: 'View every transaction' },
        ].map(card => (
          <a key={card.href} href={card.href}
            className="bg-white rounded-2xl border border-gray-100 p-6 hover:border-[#1F3864] hover:shadow-md transition group">
            <p className="font-semibold text-gray-800 group-hover:text-[#1F3864] transition">{card.label}</p>
            <p className="text-xs text-gray-400 mt-1">{card.desc}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
