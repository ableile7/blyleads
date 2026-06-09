'use client'
import { useState } from 'react'
import PurchaseForm from './PurchaseForm'

type Tier = { tier: string; price_per_lead: number; available_count: number }

const TIER_ORDER = ['Select', 'Prime', 'Premier', 'Essential', 'Core']

const TIER_CATEGORY: Record<string, string> = {
  Select: 'Aged Mortgage Protection', Prime: 'Aged Mortgage Protection',
  Premier: 'Aged Mortgage Protection', Core: 'Aged Mortgage Protection',
  Essential: 'Aged Mortgage Protection',
}
const PROMO_CODES: Record<string, number> = { 'ELG10': 0.10 }

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
    if (PROMO_CODES[code]) {
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
      const states = Object.entries(quantities).filter(([, q]) => q > 0).map(([s]) => s)
      return { tier: tier.tier, quantity, states, pricePerLead: tier.price_per_lead }
    })
    .filter(item => item.quantity > 0)

  const totalLeads = cartItems.reduce((s, i) => s + i.quantity, 0)
  const subtotal = cartItems.reduce((s, i) => s + i.quantity * i.pricePerLead, 0)
  const discount = appliedPromo ? totalLeads * PROMO_CODES[appliedPromo] : 0
  const totalPrice = subtotal - discount

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
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{category}</span>
            <div className="flex-1 h-px bg-white/10" />
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
        <div className="bg-[#0f1729] border border-white/10 rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-lg">Cart Summary</h3>
            <span className="text-2xl font-bold text-white">${totalPrice.toFixed(2)}</span>
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
                <span className="text-green-400">Promo ({appliedPromo}) −$0.10/lead</span>
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
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#2d6af6]"
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
            className="w-full bg-[#2d6af6] hover:bg-[#1a55db] text-white font-bold py-3 rounded-xl transition disabled:opacity-50 text-sm"
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
    Prime:   'bg-[#1a3a7a] text-[#7eb3ff]',
    Select:  'bg-[#0f2b14] text-[#7ecc8f]',
    Premier: 'bg-[#2a0f2e] text-[#d47ef0]',
  }
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${styles[tier] || 'bg-white/10 text-slate-300'}`}>
      {tier}
    </span>
  )
}
