import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SuccessPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('agent_id', user.id)
    .eq('stripe_session_id', searchParams.session_id || '')
    .single()

  return (
    <div className="min-h-screen bg-[#1F3864] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-10 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Payment Successful</h1>

          {order ? (
            <>
              <p className="text-gray-500 text-sm mb-6">
                Your order of <span className="font-semibold text-gray-700">{order.quantity} {order.tier} leads</span> is being processed.
              </p>
              {order.status === 'paid' && order.download_token ? (
                <a
                  href={`/api/download?token=${order.download_token}`}
                  className="block w-full bg-[#1F3864] text-white rounded-lg py-3 font-semibold hover:bg-[#2a4a80] transition mb-4"
                >
                  Download CSV
                </a>
              ) : (
                <div className="bg-blue-50 rounded-xl p-4 mb-4">
                  <p className="text-sm text-blue-700">Your leads are being prepared. Check your order history in a moment.</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm mb-6">Your payment was received. Check your order history for the download link.</p>
          )}

          <div className="flex gap-3">
            <a href="/orders" className="flex-1 text-center border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-50 transition">
              Order History
            </a>
            <a href="/dashboard" className="flex-1 text-center bg-gray-100 text-gray-700 rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-200 transition">
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
