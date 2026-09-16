import { createClient } from '@/lib/supabase/server'
import BrowseCatalog from './BrowseCatalog'

// Public catalog — no login required. Reads the `pricing` table, which has a
// public-read RLS policy, and per-state counts come from /api/states (counts
// only, never lead rows). Lead data itself stays behind owner-scoped RLS.
export default async function BrowsePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: pricing } = await supabase
    .from('pricing')
    .select('*')
    .eq('is_active', true)
    .order('tier')

  const tiers = pricing || []
  const total = tiers.reduce((s, t) => s + (t.available_count || 0), 0)

  return (
    <div className="min-h-screen bg-ambient">
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#04070e]/70 border-b border-white/10 text-white px-6 py-3 flex items-center justify-between">
        <img src="/logo.png" alt="BlyLeads" className="h-10" />
        <div className="flex items-center gap-4">
          {user ? (
            <a href="/dashboard" className="text-sm btn-premium text-white font-semibold px-4 py-1.5 rounded-lg transition">
              Go to Dashboard
            </a>
          ) : (
            <>
              <a href="/" className="text-sm text-slate-300 hover:text-white transition">Sign In</a>
              <a href="/signup" className="text-sm btn-premium text-white font-semibold px-4 py-1.5 rounded-lg transition">
                Create Account
              </a>
            </>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <p className="label-premium mb-2">Available Now</p>
        <h2 className="text-3xl font-bold text-chrome tracking-wide mb-2">
          {total.toLocaleString()} leads in stock
        </h2>
        <p className="text-slate-400 text-sm mb-10">
          Browse pricing and availability by state. Create an account when you&apos;re ready to buy —
          you pick your states and quantities at checkout and download instantly.
        </p>

        <BrowseCatalog tiers={tiers} />

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5 text-center">
          <p className="text-slate-300 text-sm">
            Questions about a specific state or volume? Text Alex ·{' '}
            <a href="sms:+14198893444" className="text-[#7eb3ff] font-semibold hover:text-white transition">
              (419) 889-3444
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
