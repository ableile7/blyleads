export default function PendingPage({ searchParams }: { searchParams: { reason?: string } }) {
  // Suspended agents land here too (via middleware) — different copy, same shell.
  if (searchParams.reason === 'suspended') {
    return (
      <div className="min-h-screen bg-ambient flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="glass-card p-10">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-amber-500/10 border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
              <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-chrome tracking-wide mb-2">Access Temporarily Paused</h1>
            <p className="text-slate-400 text-sm leading-relaxed mb-7">
              Portal access is currently limited. Your account and order history are
              unaffected — please contact BlyLeads if you believe this is a mistake.
            </p>
            <a href="/login" className="text-sm text-[#7eb3ff] font-semibold hover:text-white transition">
              ← Back to Sign In
            </a>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-ambient flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="glass-card p-10">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-[#2d6af6]/10 border border-[#2d6af6]/30 shadow-[0_0_30px_rgba(45,106,246,0.25)]">
            <svg className="w-8 h-8 text-[#7eb3ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-chrome tracking-wide mb-2">Account Created</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-7">
            One step before you can access the portal:
          </p>

          <div className="text-left space-y-3 mb-7">
            <div className="flex items-start gap-3 bg-[#2d6af6]/8 border border-[#2d6af6]/20 rounded-xl p-4">
              <span className="w-6 h-6 btn-premium text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-sm font-semibold text-slate-200">Confirm your email</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Check your inbox for a confirmation link from BlyLeads and click it to verify your email address. Once confirmed, sign in and you&apos;ll have full access right away.</p>
              </div>
            </div>
          </div>

          <a href="/login" className="text-sm text-[#7eb3ff] font-semibold hover:text-white transition">
            ← Back to Sign In
          </a>
        </div>
      </div>
    </div>
  )
}
