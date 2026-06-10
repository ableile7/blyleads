export default function PendingPage() {
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
            Two steps before you can access the portal:
          </p>

          <div className="text-left space-y-3 mb-7">
            <div className="flex items-start gap-3 bg-[#2d6af6]/8 border border-[#2d6af6]/20 rounded-xl p-4">
              <span className="w-6 h-6 btn-premium text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-sm font-semibold text-slate-200">Confirm your email</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Check your inbox for a confirmation link from BlyLeads and click it to verify your email address.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <span className="w-6 h-6 bg-white/10 text-slate-300 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-sm font-semibold text-slate-200">Await admin approval</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Once your email is confirmed, your account will be reviewed. You&apos;ll be able to sign in once approved.</p>
              </div>
            </div>
          </div>

          <a href="/" className="text-sm text-[#7eb3ff] font-semibold hover:text-white transition">
            ← Back to Sign In
          </a>
        </div>
      </div>
    </div>
  )
}
