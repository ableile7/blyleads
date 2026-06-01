'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginGate() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      setError('Invalid password')
      setLoading(false)
      return
    }
    window.location.href = '/admin'
  }

  return (
    <div className="min-h-screen bg-[#1F3864] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">BlyLeads</h1>
          <p className="text-blue-200 mt-1 text-sm">Admin Access</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
                placeholder="••••••••"
                autoFocus
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1F3864] text-white rounded-lg py-2.5 font-semibold hover:bg-[#2a4a80] transition disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Enter Admin Panel'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
