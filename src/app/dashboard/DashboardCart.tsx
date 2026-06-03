'use client'
import { useState } from 'react'
import PurchaseForm from './PurchaseForm'

type Tier = { tier: string; price_per_lead: number; available_count: number }

export default function DashboardCart({ tiers }: { tiers: Tier[] }) {
  const [cart, setCart] = useState<Record<string, Record<string, number>>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function updateTier(tier: string, quantities: Record<string, number>) {
    setCart(prev => ({ ...prev, [tier]: quantities }))
  }

  const cartItems = tiers
    .map(tier => {
      const quantities = cart[tier.tier] || {}
      const quantity = Object.values(quantities).reduce((s, q) => s + q, 0)
      const states = Object.entries(quantities).filter(([, q]) => q > 0).map(([s]) => s)
      return { tier: tier.tier, quantity, states, pricePerLead: tier.price_per_lead }
    })
    .filter(item => item.quantity > 0)

  const totalLeads = cartItems.reduce((s, i) => s + i.quantity, 0)
  const totalPrice = cartItems.reduce((s, i) => s + i.quantity * i.pricePerLead, 0)

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
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Something went wrong'); setLoading(false); return }
    window.location.href = data.url
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map(tier => (
          <PurchaseForm
            key={tier.tier}
            tier={tier}
            quantities={cart[tier.tier] || {}}
            onQuantitiesChange={q => updateTier(tier.tier, q)}
          />
        ))}
      </div>

      {totalLeads > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800 text-lg">Cart Summary</h3>
            <span className="text-2xl font-bold text-gray-800">${totalPrice.toFixed(2)}</span>
          </div>

          <div className="space-y-2 mb-5">
            {cartItems.map(item => (
              <div key={item.tier} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <TierBadge tier={item.tier} />
                  <span className="text-gray-600">{item.quantity} lead{item.quantity !== 1 ? 's' : ''}</span>
                  {item.states.length > 0 && (
                    <span className="text-xs text-gray-400">({item.states.join(', ')})</span>
                  )}
                </div>
                <span className="font-semibold text-gray-700">${(item.quantity * item.pricePerLead).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

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
    Prime:   'bg-[#e8f0f8] text-[#2d6af6]',
    Select:  'bg-[#eaf2e4] text-[#2d4a1e]',
    Premier: 'bg-[#f5eaf2] text-[#4a1e3a]',
  }
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${styles[tier] || 'bg-gray-100 text-gray-600'}`}>
      {tier}
    </span>
  )
}
