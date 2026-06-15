'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClearUnpaidButton({ count }: { count: number }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClear() {
    if (!confirm(`Remove ${count} abandoned order${count === 1 ? '' : 's'}? These are checkouts that were never paid. This can't be undone.`)) {
      return
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/clear-unpaid', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      setLoading(false)
      return
    }
    router.refresh()
  }

  return (
    <div className="text-right">
      <button
        onClick={handleClear}
        disabled={loading}
        className="text-xs font-semibold text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition disabled:opacity-50"
      >
        {loading ? 'Clearing…' : `Clear abandoned (${count})`}
      </button>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}
