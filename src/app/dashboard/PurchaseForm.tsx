'use client'
import { useState, useEffect } from 'react'

type Tier = { tier: string; price_per_lead: number; available_count: number }
type StateCount = { state: string; count: number }

const TIER_STYLES: Record<string, { badge: string; bg: string; border: string }> = {
  Prime:   { badge: 'bg-[#1a3a7a] text-[#7eb3ff]', bg: 'bg-[#0b1628]', border: 'border-[#2d5a9e]' },
  Select:  { badge: 'bg-[#0f2b14] text-[#7ecc8f]', bg: 'bg-[#0b1a0e]', border: 'border-[#2d7a3e]' },
  Premier: { badge: 'bg-[#2a0f2e] text-[#d47ef0]', bg: 'bg-[#160b19]', border: 'border-[#7a2d9e]' },
}

const TIER_INFO: Record<string, { title: string; description: string }> = {
  Prime:   { title: 'Bronze Replay (2023)', description: 'Previously sold incomplete leads from 2023. The prospect disconnected before completing the qualification process.' },
  Select:  { title: 'Copper Replay (2022)', description: 'Previously sold incomplete leads from 2022. The prospect disconnected before completing the qualification process.' },
  Premier: { title: 'Ruby Replay (2024)',   description: 'Previously sold incomplete leads from 2024. The prospect disconnected before completing the qualification process.' },
}

type Props = {
  tier: Tier
  quantities: Record<string, number>
  onQuantitiesChange: (quantities: Record<string, number>) => void
}

export default function PurchaseForm({ tier, quantities, onQuantitiesChange }: Props) {
  const [states, setStates] = useState<StateCount[]>([])
  const [loadingStates, setLoadingStates] = useState(true)
  const c = TIER_STYLES[tier.tier] || TIER_STYLES.Prime

  useEffect(() => {
    fetch(`/api/states?tier=${tier.tier}`)
      .then(r => r.json())
      .then(data => { setStates(data); setLoadingStates(false) })
      .catch(() => setLoadingStates(false))
  }, [tier.tier])

  function setQty(state: string, value: number, max: number) {
    const clamped = Math.max(0, Math.min(value, max))
    onQuantitiesChange({ ...quantities, [state]: clamped })
  }

  function selectAll() {
    const all: Record<string, number> = {}
    states.forEach(s => { all[s.state] = s.count })
    onQuantitiesChange(all)
  }

  function clearAll() { onQuantitiesChange({}) }

  const tierTotal = Object.values(quantities).reduce((s, q) => s + q, 0)
  const soldOut = tier.available_count === 0
  const info = TIER_INFO[tier.tier]

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-6 flex flex-col gap-4`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${c.badge}`}>{tier.tier}</span>
        <span className="text-2xl font-bold text-white">
          ${tier.price_per_lead}<span className="text-sm font-normal text-slate-400">/lead</span>
        </span>
      </div>

      {info && (
        <div>
          <p className="text-sm font-semibold text-slate-200">{info.title}</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{info.description}</p>
        </div>
      )}

      <p className="text-sm text-slate-400">
        <span className="font-semibold text-slate-200">{tier.available_count}</span> total leads available
      </p>

      {soldOut ? (
        <div className="bg-white/5 rounded-lg px-4 py-3 text-center">
          <span className="text-sm font-semibold text-slate-500">Sold Out</span>
        </div>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400">Select by State</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-[#2d6af6] hover:underline">All</button>
                <span className="text-slate-600">|</span>
                <button onClick={clearAll} className="text-xs text-slate-500 hover:underline">Clear</button>
              </div>
            </div>

            {loadingStates ? (
              <p className="text-xs text-slate-500">Loading states…</p>
            ) : (
              <div className="max-h-52 overflow-y-auto bg-black/20 rounded-xl border border-white/10 divide-y divide-white/5">
                {states.map(({ state, count }) => (
                  <div key={state} className="flex items-center justify-between px-3 py-2 gap-3">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-slate-200">{state}</span>
                      <span className="text-xs text-slate-500">({count})</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={count}
                      value={quantities[state] || ''}
                      placeholder="0"
                      onChange={e => setQty(state, parseInt(e.target.value) || 0, count)}
                      className="w-16 text-center text-sm bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white focus:outline-none focus:border-[#2d6af6] placeholder-slate-600"
                    />
                  </div>
                ))}
                {states.length === 0 && <p className="text-xs text-slate-500 px-3 py-3">No states available</p>}
              </div>
            )}
          </div>

          {tierTotal > 0 && (
            <div className="bg-white/5 rounded-lg px-3 py-2 text-xs text-slate-400 flex justify-between">
              <span>{tierTotal} lead{tierTotal !== 1 ? 's' : ''} selected</span>
              <span className="font-semibold text-white">${(tier.price_per_lead * tierTotal).toFixed(2)}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
