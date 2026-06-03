'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FulfillButton({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleFulfill() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/fulfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error)
      setLoading(false)
      return
    }
    router.refresh()
  }

  return (
    <div>
      <button
        onClick={handleFulfill}
        disabled={loading}
        className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
      >
        {loading ? 'Fulfilling…' : 'Fulfill'}
      </button>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}
