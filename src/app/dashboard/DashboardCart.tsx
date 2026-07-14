'use client'
import { useState } from 'react'
import PurchaseForm from './PurchaseForm'
import { tierLabel } from '@/lib/tiers'

type Tier = { tier: string; price_per_lead: number; available_count: number }

const TIER_ORDER = ['Apex', 'A-Tier', 'Core 2024-2025', 'Core 2023', 'Core 2021-2022', 'Core 2018-2020', 'Premier', 'Prime', 'Select', 'Essential 2024-2025', 'Essential 2023', 'Essential 2021-2022', 'Essential 2018-2020', 'Essential', 'Core', 'Data Leads']

const TIER_CATEGORY: Record<string, string> = {
  Apex: 'Highest Quality Aged Mortgage Protection',
  'A-Tier': 'Highest Quality Aged Mortgage Protection',
  Select: 'Aged Mortgage Protection', Prime: 'Aged Mortgage Protection',
  Premier: 'Aged Mortgage Protection', Core: 'Aged Mortgage Protection',
  Essential: 'Aged Mortgage Protection',
  'Core 2018-2020': 'Aged Mortgage Protection',
  'Core 2021-2022': 'Aged Mortgage Protection',
  'Core 2023': 'Aged Mortgage Protection',
  'Essential 2018-2020': 'Aged Mortgage Protection',
  'Essential 2021-2022': 'Aged Mortgage Protection',
  'Essential 2023': 'Aged Mortgage Protection',
  'Core 2024-2025': 'Aged Mortgage Protection',
  'Essential 2024-2025': 'Aged Mortgage Protection',
}
const PROMO_CODES: Record<string, number> = { 'ELG2026': 0.10 }
// 100%-off codes (free). The server enforces which agent each is locked to.
const FREE_CODES = ['STARRFREE']
// Percent-off codes scoped to a single tier. The server enforces the account
// lock and single use; here we just compute/show the discount on that tier.
const TIER_PERCENT_CODES: Record<string, { tier: string; percentOff: number }> = {
  'COLBY20': { tier: 'Core 2021-2022', percentOff: 20 },
}

export default function DashboardCart({ tiers }: { tiers: Tier[] }) {
  const [cart, setCart] = useState<Record<string, Record<string, number>>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null)
  const [promoError, setPromoError] = useState('')

  const sortedTiers = [...tiers].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))

  function updateTier(tier: string, quantities: Record<string, number>) {
    setCart(prev => ({ ...prev, [tier]: quantities }))
  }

  function applyPromo() {
    const code = promoInput.trim().toUpperCase()
    if (PROMO_CODES[code] || FREE_CODES.includes(code) || TIER_PERCENT_CODES[code]) {
      setAppliedPromo(code)
      setPromoError('')
    } else {
      setPromoError('Invalid promo code')
    }
  }

  function removePromo() {
    setAppliedPromo(null)
    setPromoInput('')
    setPromoError('')
  }

  const cartItems = sortedTiers
    .map(tier => {
      const quantities = cart[tier.tier] || {}
      const quantity = Object.values(quantities).reduce((s, q) => s + q, 0)
      const stateQuantities = Object.fromEntries(Object.entries(quantities).filter(([, q]) => q > 0))
      const states = Object.keys(stateQuantities)
      return { tier: tier.tier, quantity, states, stateQuantities, pricePerLead: tier.price_per_lead }
    })
    .filter(item => item.quantity > 0)

  const totalLeads = cartItems.reduce((s, i) => s + i.quantity, 0)
  const subtotal = cartItems.reduce((s, i) => s + i.quantity * i.pricePerLead, 0)
  const isFreePromo = appliedPromo ? FREE_CODES.includes(appliedPromo) : false
  const tierPromo = appliedPromo ? TIER_PERCENT_CODES[appliedPromo] : undefined
  const discount = isFreePromo ? subtotal
    : tierPromo ? cartItems.filter(i => i.tier === tierPromo.tier).reduce((s, i) => s + i.quantity * i.pricePerLead, 0) * (tierPromo.percentOff / 100)
    : (appliedPromo ? totalLeads * PROMO_CODES[appliedPromo] : 0)
  const totalPrice = Math.max(0, subtotal - discount)

  async function handleCheckout() {
    if (totalLeads === 0) return
    setError('')
    setLoading(true)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cartItems.map(i => ({
          tier: i.tier,
          quantity: i.quantity,
          states: i.states.length > 0 ? i.states : null,
          stateQuantities: i.states.length > 0 ? i.stateQuantities : null,
        })),
        promoCode: appliedPromo,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Something went wrong'); setLoading(false); return }
    window.location.href = data.url
  }

  return (
    <div className="flex flex-col gap-8">
      {Object.entries(
        sortedTiers.reduce<Record<string, typeof sortedTiers>>((acc, tier) => {
          const cat = TIER_CATEGORY[tier.tier] || 'Other'
          acc[cat] = acc[cat] ? [...acc[cat], tier] : [tier]
          return acc
        }, {})
      ).map(([category, categoryTiers]) => (
        <div key={category}>
          <div className="flex items-center gap-3 mb-4">
            <span className="label-premium">{category}</span>
            <div className="flex-1 h-px bg-gradient-to-r from-white/20 to-transparent" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {categoryTiers.map(tier => (
              <PurchaseForm
                key={tier.tier}
                tier={tier}
                quantities={cart[tier.tier] || {}}
                onQuantitiesChange={q => updateTier(tier.tier, q)}
              />
            ))}
          </div>
        </div>
      ))}

      {totalLeads > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-chrome text-lg tracking-wide">Cart Summary</h3>
            <span className="text-2xl font-bold text-chrome">${totalPrice.toFixed(2)}</span>
          </div>

          <div className="space-y-2 mb-5">
            {cartItems.map(item => (
              <div key={item.tier} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <TierBadge tier={item.tier} />
                  <span className="text-slate-300">{item.quantity} lead{item.quantity !== 1 ? 's' : ''}</span>
                  {item.states.length > 0 && (
                    <span className="text-xs text-slate-500">({item.states.join(', ')})</span>
                  )}
                </div>
                <span className="font-semibold text-white">${(item.quantity * item.pricePerLead).toFixed(2)}</span>
              </div>
            ))}

            {discount > 0 && (
              <div className="flex items-center justify-between text-sm pt-2 border-t border-white/10">
                <span className="text-green-400">{isFreePromo ? `Promo (${appliedPromo}) — 100% off`
                  : tierPromo ? `Promo (${appliedPromo}) — ${tierPromo.percentOff}% off ${tierLabel(tierPromo.tier)}`
                  : `Promo (${appliedPromo}) −$${PROMO_CODES[appliedPromo!].toFixed(2)}/lead`}</span>
                <span className="font-semibold text-green-400">−${discount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Promo code */}
          {appliedPromo ? (
            <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2.5 mb-4">
              <span className="text-sm text-green-400 font-semibold">{appliedPromo} applied</span>
              <button onClick={removePromo} className="text-xs text-slate-400 hover:text-white transition">Remove</button>
            </div>
          ) : (
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Promo code"
                value={promoInput}
                onChange={e => { setPromoInput(e.target.value); setPromoError('') }}
                onKeyDown={e => e.key === 'Enter' && applyPromo()}
                className="input-dark flex-1 px-3 py-2 text-sm"
              />
              <button
                onClick={applyPromo}
                className="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
              >
                Apply
              </button>
            </div>
          )}
          {promoError && <p className="text-red-400 text-xs mb-3">{promoError}</p>}

          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="btn-premium w-full text-white font-bold py-3 rounded-xl text-sm tracking-wide"
          >
            {loading ? 'Redirecting to checkout…' : `Purchase ${totalLeads} Lead${totalLeads !== 1 ? 's' : ''} — $${totalPrice.toFixed(2)}`}
          </button>
        </div>
      )}
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    Prime:     'bg-[#1a3a7a]/80 text-[#7eb3ff] border border-[#2d5a9e]/50',
    Select:    'bg-[#0f2b14]/80 text-[#7ecc8f] border border-[#2d7a3e]/50',
    Premier:   'bg-[#2a0f2e]/80 text-[#d47ef0] border border-[#7a2d9e]/50',
    Core:      'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    Essential: 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    'Data Leads': 'bg-[#06201d]/80 text-[#5fd4c4] border border-[#0f766e]/50',
    'Core 2018-2020': 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    'Core 2021-2022': 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    'Core 2023': 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    'Essential 2018-2020': 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    'Essential 2021-2022': 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    'Essential 2023': 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    'Core 2024-2025': 'bg-[#2a1f00]/80 text-[#f0c040] border border-[#9e7a00]/50',
    'Essential 2024-2025': 'bg-[#1e242e]/80 text-[#c8d4e6] border border-[#5a6a80]/50',
    Apex: 'bg-gradient-to-r from-[#3a2900] to-[#5c4200] text-[#ffd24a] border border-[#e0b020]/70',
    'A-Tier': 'bg-gradient-to-r from-[#23272d] to-[#363c44] text-[#e2e8f0] border border-[#828b96]/60',
  }
  return (
    <span className={`text-xs font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full ${styles[tier] || 'bg-white/10 text-slate-300'}`}>
      {tierLabel(tier)}
    </span>
  )
}
