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
  const [quantities, setQuantities] = useState<Record<string, number>>({})
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

  function setQty(state: string, value: number, max: number) {
    const clamped = Math.max(0, Math.min(value, max))
    setQuantities(prev => ({ ...prev, [state]: clamped }))
  }

  function selectAll() {
    const all: Record<string, number> = {}
    states.forEach(s => { all[s.state] = s.count })
    setQuantities(all)
  }

  function clearAll() { setQuantities({}) }

  const totalLeads = Object.values(quantities).reduce((sum, q) => sum + q, 0)
  const totalPrice = (tier.price_per_lead * totalLeads).toFixed(2)
  const selectedStates = states.filter(s => (quantities[s.state] || 0) > 0).map(s => s.state)
  const soldOut = tier.available_count === 0

  async function handlePurchase() {
    if (totalLeads === 0) { setError('Enter a quantity for at least one state'); return }
    setError('')
    setLoading(true)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier: tier.tier,
        quantity: totalLeads,
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600">Select by State</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">All</button>
                <span className="text-gray-300">|</span>
                <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">Clear</button>
              </div>
            </div>

            {loadingStates ? (
              <p className="text-xs text-gray-400">Loading states…</p>
            ) : (
              <div className="max-h-52 overflow-y-auto bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
                {states.map(({ state, count }) => (
                  <div key={state} className="flex items-center justify-between px-3 py-2 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-gray-700">{state}</span>
                      <span className="text-xs text-gray-400">({count} avail)</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={count}
                      value={quantities[state] || ''}
                      placeholder="0"
                      onChange={e => setQty(state, parseInt(e.target.value) || 0, count)}
                      className="w-16 text-center text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-gray-400"
                    />
                  </div>
                ))}
                {states.length === 0 && <p className="text-xs text-gray-400 px-3 py-3">No states available</p>}
              </div>
            )}
          </div>

          <div className="bg-white/60 rounded-lg px-4 py-2.5 text-sm flex justify-between items-center">
            <div>
              <span className="text-gray-500">Total: </span>
              <span className="font-semibold text-gray-800">{totalLeads} lead{totalLeads !== 1 ? 's' : ''}</span>
              {selectedStates.length > 0 && (
                <span className="text-xs text-gray-400 ml-1">({selectedStates.length} state{selectedStates.length > 1 ? 's' : ''})</span>
              )}
            </div>
            <span className="font-bold text-gray-800">${totalPrice}</span>
          </div>
        </>
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <button
        onClick={handlePurchase}
        disabled={loading || soldOut || totalLeads === 0}
        className={`mt-auto text-white rounded-lg py-2.5 font-semibold text-sm transition disabled:opacity-50 ${c.btn}`}
      >
        {soldOut ? 'Sold Out' : loading ? 'Redirecting…' : `Purchase ${totalLeads > 0 ? totalLeads : ''} Leads`}
      </button>
    </div>
  )
}
