'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [fromCheckout, setFromCheckout] = useState(false)
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setFromCheckout(new URLSearchParams(window.location.search).get('checkout') === '1')
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-ambient flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img src="/logo.png" alt="BlyLeads" className="w-80 mx-auto drop-shadow-[0_0_28px_rgba(45,106,246,0.35)]" />
          <p className="label-premium mt-4">Private Lead Exchange</p>
        </div>

        <div className="glass-card p-8">
          {fromCheckout && (
            <div className="mb-6 rounded-xl border border-[#2d6af6]/30 bg-[#2d6af6]/10 px-4 py-3">
              <p className="text-sm font-semibold text-slate-100">One step to finish your order</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Sign in below, or{' '}
                <a href="/signup" className="text-[#7eb3ff] font-semibold hover:text-white transition">create an account</a>
                {' '}— your cart is saved either way.
              </p>
            </div>
          )}
          <h2 className="text-lg font-semibold text-chrome tracking-wide mb-6">Sign In</h2>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="label-premium block mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-dark w-full px-4 py-3 text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label-premium block mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-dark w-full px-4 py-3 text-sm"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn-premium w-full text-white rounded-xl py-3 font-semibold text-sm tracking-wide"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-7 pt-6 border-t border-white/10 text-center">
            <p className="text-sm text-slate-400">
              Don&apos;t have an account?{' '}
              <a href="/signup" className="text-[#7eb3ff] font-semibold hover:text-white transition">
                Create One
              </a>
            </p>
            <p className="text-sm text-slate-500 mt-2">
              or{' '}
              <a href="/" className="text-[#7eb3ff] font-semibold hover:text-white transition">
                browse available leads
              </a>{' '}
              first — no account needed
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
