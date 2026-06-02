'use client'
import { useState, useEffect } from 'react'

type Tier = { tier: string; price_per_lead: number; available_count: number }
type StateCount = { state: string; count: number }

const TIER_STYLES: Record<string, { badge: string; bg: string; border: string; btn: string }> = {
  Prime:   { badge: 'bg-[#1F3864] text-white', bg: 'bg-[#e8f0f8]', border: 'border-[#3b7abf]', btn: 'bg-[#1F3864] hover:bg-[#2a4a80]' },
  Select:  { badge: 'bg-[#2d4a1e] text-white', bg: 'bg-[#eaf2e4]', border: 'border-[#5a9e3a]', btn: 'bg-[#2d4a1e] hover:bg-[#3a5f28]' },
  Premier: { badge: 'bg-[#4a1e3a] text-white', bg: 'bg-[#f5eaf2]', border: 'border-[#9e3a7a]', btn: 'bg-[#4a1e3a] hover:bg-[#5e2a4a]' },
}

export default function PurchaseForm({ tier }: { tier: Tier }) {
  const [states, setStates] = useState<StateCount[]>([])
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [loadingStates, setLoadingStates] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const c = TIER_STYLES[tier.tier] || TIER_STYLES.Prime

  useEffect(() => {
    fetch(`/api/states?tier=${tier.tier}`)
      .then(r => r.json())
      .then(data => { setStates(data); setLoadingStates(false) })
      .catch(() => setLoadingStates(false))
  }, [tier.tier])

  function toggleState(state: string) {
    setSelectedStates(prev =>
      prev.includes(state) ? prev.filter(s => s !== state) : [...prev, state]
    )
  }

  function selectAll() { setSelectedStates(states.map(s => s.state)) }
  function clearAll() { setSelectedStates([]) }

  const availableInSelected = selectedStates.length === 0
    ? tier.available_count
    : states.filter(s => selectedStates.includes(s.state)).reduce((sum, s) => sum + s.count, 0)

  const total = (tier.price_per_lead * availableInSelected).toFixed(2)
  const soldOut = tier.available_count === 0

  async function handlePurchase() {
    if (availableInSelected === 0) { setError('No leads available for selected states'); return }
    setError('')
    setLoading(true)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier: tier.tier,
        quantity: availableInSelected,
        states: selectedStates.length > 0 ? selectedStates : null,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Something went wrong'); setLoading(false); return }
    window.location.href = data.url
  }

  return (
    <div className={`rounded-2xl border-2 ${c.border} ${c.bg} p-6 flex flex-col gap-4`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${c.badge}`}>{tier.tier}</span>
        <span className="text-2xl font-bold text-gray-800">
          ${tier.price_per_lead}<span className="text-sm font-normal text-gray-500">/lead</span>
        </span>
      </div>

      <p className="text-sm text-gray-600">
        <span className="font-semibold text-gray-800">{tier.available_count}</span> total leads available
      </p>

      {!soldOut && (
        <>
          {/* State selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600">Filter by State</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">All</button>
                <span className="text-gray-300">|</span>
                <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">None</button>
              </div>
            </div>

            {loadingStates ? (
              <p className="text-xs text-gray-400">Loading states…</p>
            ) : (
              <div className="max-h-44 overflow-y-auto bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
                {states.map(({ state, count }) => (
                  <label key={state} className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 transition ${selectedStates.includes(state) ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedStates.includes(state)}
                        onChange={() => toggleState(state)}
                        className="w-3.5 h-3.5 accent-[#1F3864]"
                      />
                      <span className="text-sm font-medium text-gray-700">{state}</span>
                    </div>
                    <span className="text-xs text-gray-400 font-semibold">{count}</span>
                  </label>
                ))}
                {states.length === 0 && <p className="text-xs text-gray-400 px-3 py-3">No states available</p>}
              </div>
            )}
          </div>

          <div className="bg-white/60 rounded-lg px-4 py-2.5 text-sm flex justify-between items-center">
            <div>
              <span className="text-gray-500">Selected: </span>
              <span className="font-semibold text-gray-800">{availableInSelected} leads</span>
              {selectedStates.length > 0 && (
                <span className="text-xs text-gray-400 ml-1">({selectedStates.length} state{selectedStates.length > 1 ? 's' : ''})</span>
              )}
            </div>
            <span className="font-bold text-gray-800">${total}</span>
          </div>
        </>
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <button
        onClick={handlePurchase}
        disabled={loading || soldOut || availableInSelected === 0}
        className={`mt-auto text-white rounded-lg py-2.5 font-semibold text-sm transition disabled:opacity-50 ${c.btn}`}
      >
        {soldOut ? 'Sold Out' : loading ? 'Redirecting…' : `Purchase ${availableInSelected > 0 ? availableInSelected : ''} Leads`}
      </button>
    </div>
  )
}
