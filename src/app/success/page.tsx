import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fulfillPaidSession } from '@/lib/fulfillment'
import { redirect } from 'next/navigation'

export default async function SuccessPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const adminSupabase = createAdminClient()

  // Self-healing fulfillment: the Stripe webhook normally assigns leads the
  // instant payment completes, but if it's misconfigured or fails, fulfill here
  // when the agent lands on this page. fulfillPaidSession verifies payment with
  // Stripe and is idempotent, so this is a no-op when the webhook already ran.
  if (searchParams.session_id) {
    await fulfillPaidSession(adminSupabase, searchParams.session_id)
  }

  const { data: orders } = await adminSupabase
    .from('orders')
    .select('*')
    .eq('agent_id', user.id)
    .eq('stripe_session_id', searchParams.session_id || '')
    .order('tier')

  const totalLeads = orders?.reduce((s, o) => s + o.quantity, 0) ?? 0
  const totalAmount = orders?.reduce((s, o) => s + Number(o.total_amount), 0) ?? 0
  const allPaid = orders?.every(o => o.status === 'paid') ?? false
  const downloadToken = orders?.[0]?.download_token

  return (
    <div className="min-h-screen bg-ambient flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="glass-card p-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-green-500/10 border border-green-500/30 shadow-[0_0_30px_rgba(74,222,128,0.2)]">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-chrome tracking-wide mb-2">Payment Successful</h1>

          {orders && orders.length > 0 ? (
            <>
              <p className="text-slate-400 text-sm mb-5">
                Your order of <span className="font-semibold text-slate-200">{totalLeads.toLocaleString()} leads</span> totaling{' '}
                <span className="font-semibold text-slate-200">${totalAmount.toFixed(2)}</span> is being processed.
              </p>

              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-6 text-left space-y-2">
                {orders.map(order => (
                  <div key={order.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <TierBadge tier={order.tier} />
                      <span className="text-slate-400">{order.quantity.toLocaleString()} leads</span>
                    </div>
                    <span className="font-semibold text-slate-200">${Number(order.total_amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {allPaid && downloadToken ? (
                <a
                  href={`/api/download?token=${downloadToken}`}
                  className="btn-premium block w-full text-white rounded-xl py-3 font-semibold text-sm tracking-wide mb-4"
                >
                  Download Excel File
                </a>
              ) : (
                <div className="bg-[#2d6af6]/10 border border-[#2d6af6]/25 rounded-xl p-4 mb-4">
                  <p className="text-sm text-[#7eb3ff]">Your leads are being prepared. Check your order history in a moment.</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-400 text-sm mb-6">Your payment was received. Check your order history for the download link.</p>
          )}

          <div className="flex gap-3">
            <a href="/orders" className="flex-1 text-center border border-white/15 text-slate-300 rounded-lg py-2.5 text-sm font-semibold hover:bg-white/5 hover:text-white transition">
              Order History
            </a>
            <a href="/dashboard" className="flex-1 text-center bg-white/5 border border-white/10 text-slate-300 rounded-lg py-2.5 text-sm font-semibold hover:bg-white/10 hover:text-white transition">
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
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
    Apex: 'bg-gradient-to-r from-[#3a2900] to-[#5c4200] text-[#ffd24a] border border-[#e0b020]/70',
  }
  return (
    <span className={`text-xs font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full ${styles[tier] || 'bg-white/10 text-slate-300'}`}>
      {tier}
    </span>
  )
}
