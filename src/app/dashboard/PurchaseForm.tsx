'use client'
import { useState, useEffect } from 'react'
import { tierLabel } from '@/lib/tiers'

type Tier = { tier: string; price_per_lead: number; available_count: number }
type StateCount = { state: string; count: number }

const TIER_STYLES: Record<string, { badge: string; bg: string; border: string; glow: string }> = {
  Apex:      { badge: 'bg-gradient-to-r from-[#3a2900] to-[#5c4200] text-[#ffd24a] border border-[#e0b020]/70', bg: 'bg-gradient-to-b from-[#2a1d00]/90 to-[#120c00]/96', border: 'border-[#e0b020]/55', glow: 'shadow-[0_0_36px_-8px_rgba(255,205,55,0.5)] hover:shadow-[0_0_64px_-4px_rgba(255,205,55,0.75)]' },
  'A-Tier':  { badge: 'bg-gradient-to-r from-[#23272d] to-[#363c44] text-[#e2e8f0] border border-[#9aa3ad]/60', bg: 'bg-gradient-to-b from-[#16191e]/90 to-[#0b0d10]/96', border: 'border-[#828b96]/45', glow: 'shadow-[0_0_28px_-10px_rgba(210,218,228,0.4)] hover:shadow-[0_0_50px_-6px_rgba(210,218,228,0.6)]' },
  Prime:     { badge: 'bg-[#1a3a7a]/80 text-[#7eb3ff] border border-[#2d5a9e]/50', bg: 'bg-gradient-to-b from-[#0c1830]/90 to-[#070d1a]/95', border: 'border-[#2d5a9e]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(45,106,246,0.4)]' },
  Select:    { badge: 'bg-[#0f2b14]/80 text-[#7ecc8f] border border-[#2d7a3e]/50', bg: 'bg-gradient-to-b from-[#0c1f10]/90 to-[#060f08]/95', border: 'border-[#2d7a3e]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(60,180,90,0.35)]' },
  Premier:   { badge: 'bg-[#2a0f2e]/80 text-[#d47ef0] border border-[#7a2d9e]/50', bg: 'bg-gradient-to-b from-[#1c0e20]/90 to-[#0e0612]/95', border: 'border-[#7a2d9e]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(170,80,220,0.4)]' },
  Core:      { badge: 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50', bg: 'bg-gradient-to-b from-[#1f1700]/90 to-[#0f0b00]/95', border: 'border-[#9e7a00]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(240,192,64,0.35)]' },
  Essential: { badge: 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50', bg: 'bg-gradient-to-b from-[#141a24]/90 to-[#0a0e14]/95', border: 'border-[#5a6a80]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(160,180,210,0.3)]' },
  'Data Leads': { badge: 'bg-[#06201d]/80 text-[#5fd4c4] border border-[#0f766e]/50', bg: 'bg-gradient-to-b from-[#08231f]/90 to-[#04100e]/95', border: 'border-[#0f766e]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(20,184,166,0.35)]' },
  'Core 2018-2020': { badge: 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50', bg: 'bg-gradient-to-b from-[#1f1700]/90 to-[#0f0b00]/95', border: 'border-[#9e7a00]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(240,192,64,0.35)]' },
  'Core 2021-2022': { badge: 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50', bg: 'bg-gradient-to-b from-[#1f1700]/90 to-[#0f0b00]/95', border: 'border-[#9e7a00]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(240,192,64,0.35)]' },
  'Core 2023': { badge: 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50', bg: 'bg-gradient-to-b from-[#1f1700]/90 to-[#0f0b00]/95', border: 'border-[#9e7a00]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(240,192,64,0.35)]' },
  'Essential 2018-2020': { badge: 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50', bg: 'bg-gradient-to-b from-[#141a24]/90 to-[#0a0e14]/95', border: 'border-[#5a6a80]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(160,180,210,0.3)]' },
  'Essential 2021-2022': { badge: 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50', bg: 'bg-gradient-to-b from-[#141a24]/90 to-[#0a0e14]/95', border: 'border-[#5a6a80]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(160,180,210,0.3)]' },
  'Essential 2023': { badge: 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50', bg: 'bg-gradient-to-b from-[#141a24]/90 to-[#0a0e14]/95', border: 'border-[#5a6a80]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(160,180,210,0.3)]' },
  'Core 2024-2025': { badge: 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50', bg: 'bg-gradient-to-b from-[#1f1700]/90 to-[#0f0b00]/95', border: 'border-[#9e7a00]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(240,192,64,0.35)]' },
  'Essential 2024-2025': { badge: 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50', bg: 'bg-gradient-to-b from-[#141a24]/90 to-[#0a0e14]/95', border: 'border-[#5a6a80]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(160,180,210,0.3)]' },
  'Core 2023-2025': { badge: 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50', bg: 'bg-gradient-to-b from-[#1f1700]/90 to-[#0f0b00]/95', border: 'border-[#9e7a00]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(240,192,64,0.35)]' },
  'Essential 2023-2025': { badge: 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50', bg: 'bg-gradient-to-b from-[#141a24]/90 to-[#0a0e14]/95', border: 'border-[#5a6a80]/40', glow: 'hover:shadow-[0_0_40px_-8px_rgba(160,180,210,0.3)]' },
}

const TIER_INFO: Record<string, { year: string; description: string }> = {
  Apex:      { year: '★ S-Tier · 3-6 mo', description: 'Our freshest, highest-quality mortgage protection leads — complete profiles, roughly 3-6 months old.' },
  'A-Tier':  { year: 'A-Tier · 9-12 mo', description: 'High-quality mortgage protection leads — complete profiles, roughly 9-12 months old.' },
  Prime:     { year: '2023',    description: 'Previously sold incomplete leads from 2023. The prospect disconnected before completing the qualification process.' },
  Select:    { year: '2022',    description: 'Previously sold incomplete leads from 2022. The prospect disconnected before completing the qualification process.' },
  Premier:   { year: '2024',    description: 'Previously sold incomplete leads from 2024. The prospect disconnected before completing the qualification process.' },
  Core:      { year: 'Complete', description: 'Complete leads — the full client profile was captured when the lead was generated.' },
  Essential: { year: 'Partial',  description: 'Partial leads — only some client details were captured when the lead was generated.' },
  'Core 2018-2020': { year: 'Complete', description: 'Complete leads — the full client profile was captured when the lead was generated.' },
  'Core 2021-2022': { year: 'Complete', description: 'Complete leads — the full client profile was captured when the lead was generated.' },
  'Core 2023':      { year: 'Complete', description: 'Complete leads — the full client profile was captured when the lead was generated.' },
  'Essential 2018-2020': { year: 'Partial', description: 'Partial leads — only some client details were captured when the lead was generated.' },
  'Essential 2021-2022': { year: 'Partial', description: 'Partial leads — only some client details were captured when the lead was generated.' },
  'Essential 2023':      { year: 'Partial', description: 'Partial leads — only some client details were captured when the lead was generated.' },
  'Core 2024-2025':      { year: 'Complete', description: 'Complete leads — the full client profile was captured when the lead was generated.' },
  'Essential 2024-2025': { year: 'Partial', description: 'Partial leads — only some client details were captured when the lead was generated.' },
  'Core 2023-2025':      { year: 'Complete', description: 'Complete leads — the full client profile was captured when the lead was generated.' },
  'Essential 2023-2025': { year: 'Partial', description: 'Partial leads — only some client details were captured when the lead was generated.' },
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
    <div className={`rounded-2xl border ${c.border} ${c.bg} ${c.glow} backdrop-blur-sm p-6 flex flex-col gap-4 transition-shadow duration-300`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-bold tracking-wide uppercase px-3 py-1 rounded-full whitespace-nowrap ${c.badge}`}>{tierLabel(tier.tier)}</span>
        <span className="text-2xl font-bold text-chrome whitespace-nowrap shrink-0">
          ${tier.price_per_lead.toFixed(2)}<span className="text-sm font-normal text-slate-500">/lead</span>
        </span>
      </div>

      {info && (
        <div>
          <span className="label-premium">{info.year}</span>
          <p className="text-xs text-slate-400 leading-relaxed mt-1">{info.description}</p>
        </div>
      )}

      <p className="text-sm text-slate-400">
        <span className="font-semibold text-slate-200">{tier.available_count.toLocaleString()}</span> total leads available
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
                      className="input-dark w-16 text-center text-sm px-2 py-1"
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
