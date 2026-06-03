export default function PendingPage() {
  return (
    <div className="min-h-screen bg-[#080e1c] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl shadow-2xl p-10">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#2d6af6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Account Created</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Two steps before you can access the portal:
          </p>

          <div className="text-left space-y-4 mb-6">
            <div className="flex items-start gap-3 bg-blue-50 rounded-xl p-4">
              <span className="w-6 h-6 bg-[#2d6af6] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">Confirm your email</p>
                <p className="text-xs text-gray-500 mt-0.5">Check your inbox for a confirmation link from BlyLeads and click it to verify your email address.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
              <span className="w-6 h-6 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">Await admin approval</p>
                <p className="text-xs text-gray-500 mt-0.5">Once your email is confirmed, your account will be reviewed. You&apos;ll be able to sign in once approved.</p>
              </div>
            </div>
          </div>

          <a
            href="/"
            className="text-sm text-[#2d6af6] font-semibold hover:underline"
          >
            ← Back to Sign In
          </a>
        </div>
      </div>
    </div>
  )
}
