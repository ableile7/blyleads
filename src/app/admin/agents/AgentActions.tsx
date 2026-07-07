'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function AgentActions({ agentId, currentStatus, agency }: { agentId: string; currentStatus: string; agency?: string | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function update(fields: { status?: string; agency?: string | null }) {
    setLoading(true)
    await fetch('/api/admin/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, ...fields }),
    })
    router.refresh()
    setLoading(false)
  }

  const isElg = agency === 'ELG'

  return (
    <div className="flex gap-2 shrink-0">
      <button onClick={() => update({ agency: isElg ? null : 'ELG' })} disabled={loading}
        title={isElg ? 'Remove ELG pricing' : 'Give this agent ELG (in-agency) pricing'}
        className={`text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 ${
          isElg ? 'bg-[#1F3864] text-white hover:bg-[#2a4a80]' : 'border border-[#1F3864]/40 text-[#1F3864] hover:bg-[#1F3864]/5'
        }`}>
        {isElg ? 'ELG ✓' : 'Mark ELG'}
      </button>
      {currentStatus !== 'approved' && (
        <button onClick={() => update({ status: 'approved' })} disabled={loading}
          className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50">
          {currentStatus === 'suspended' ? 'Reinstate' : 'Approve'}
        </button>
      )}
      {currentStatus === 'approved' && (
        <button onClick={() => update({ status: 'suspended' })} disabled={loading}
          className="bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-600 transition disabled:opacity-50">
          Suspend
        </button>
      )}
      {currentStatus !== 'rejected' && (
        <button onClick={() => update({ status: 'rejected' })} disabled={loading}
          className="bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-600 transition disabled:opacity-50">
          Reject
        </button>
      )}
      {currentStatus !== 'pending' && (
        <button onClick={() => update({ status: 'pending' })} disabled={loading}
          className="border border-gray-200 text-gray-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
          Reset
        </button>
      )}
    </div>
  )
}
