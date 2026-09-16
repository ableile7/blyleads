'use client'
import { useState, useEffect } from 'react'
import { tierLabel } from '@/lib/tiers'
import { TIER_STYLES, TIER_INFO } from './dashboard/PurchaseForm'

type Tier = { tier: string; price_per_lead: number; available_count: number }
type StateCount = { state: string; count: number }

const TIER_ORDER = ['Apex', 'A-Tier', 'Core', 'Premier', 'Prime', 'Select', 'Essential', 'Data Leads']

// Read-only twin of PurchaseForm: same tier styling and copy, but availability
// instead of quantity inputs. Anyone can see prices and depth; the account wall
// sits on the purchase action, not the front door.
function TierCard({ tier }: { tier: Tier }) {
  const [states, setStates] = useState<StateCount[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const c = TIER_STYLES[tier.tier] || TIER_STYLES.Prime
  const info = TIER_INFO[tier.tier]

  useEffect(() => {
    fetch(`/api/states?tier=${encodeURIComponent(tier.tier)}`)
      .then(r => r.json())
      .then(d => { setStates(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [tier.tier])

  const shown = expanded ? states : states.slice(0, 8)

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} ${c.glow} backdrop-blur-sm p-6 flex flex-col gap-4 transition-shadow duration-300`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-bold tracking-wide uppercase px-3 py-1 rounded-full whitespace-nowrap ${c.badge}`}>
          {tierLabel(tier.tier)}
        </span>
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
        <span className="font-semibold text-slate-200">{tier.available_count.toLocaleString()}</span> available
      </p>

      <div>
        <p className="label-premium mb-2">Availability by state</p>
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : states.length === 0 ? (
          <p className="text-xs text-slate-500">None available right now.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {shown.map(s => (
                <span key={s.state} className="text-xs text-slate-300 bg-white/[0.04] border border-white/10 rounded-full px-2.5 py-1">
                  {s.state} <span className="font-semibold text-white">{s.count.toLocaleString()}</span>
                </span>
              ))}
            </div>
            {states.length > 8 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="mt-2 text-xs text-[#7eb3ff] font-semibold hover:text-white transition"
              >
                {expanded ? 'Show fewer' : `Show all ${states.length} states`}
              </button>
            )}
          </>
        )}
      </div>

      <a
        href={`/signup?tier=${encodeURIComponent(tier.tier)}`}
        className="mt-1 text-center btn-premium text-white font-semibold text-sm px-5 py-3 rounded-xl transition"
      >
        Create an account to purchase
      </a>
    </div>
  )
}

export default function BrowseCatalog({ tiers }: { tiers: Tier[] }) {
  const ordered = [...tiers].sort((a, b) => {
    const ia = TIER_ORDER.indexOf(a.tier), ib = TIER_ORDER.indexOf(b.tier)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  if (ordered.length === 0) {
    return <p className="text-slate-400 text-sm">No tiers are available right now — check back shortly.</p>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {ordered.map(t => <TierCard key={t.tier} tier={t} />)}
    </div>
  )
}
