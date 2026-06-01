'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function AgentActions({ agentId, currentStatus }: { agentId: string; currentStatus: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function update(status: string) {
    setLoading(true)
    await fetch('/api/admin/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, status }),
    })
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex gap-2 shrink-0">
      {currentStatus !== 'approved' && (
        <button onClick={() => update('approved')} disabled={loading}
          className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50">
          Approve
        </button>
      )}
      {currentStatus !== 'rejected' && (
        <button onClick={() => update('rejected')} disabled={loading}
          className="bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-600 transition disabled:opacity-50">
          Reject
        </button>
      )}
      {currentStatus !== 'pending' && (
        <button onClick={() => update('pending')} disabled={loading}
          className="border border-gray-200 text-gray-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
          Reset
        </button>
      )}
    </div>
  )
}
