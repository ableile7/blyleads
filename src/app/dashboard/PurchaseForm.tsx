'use client'
import { useState } from 'react'

type Tier = {
  tier: string
  price_per_lead: number
  available_count: number
}

const TIER_STYLES: Record<string, { badge: string; bg: string; border: string; btn: string }> = {
  Prime:   { badge: 'bg-[#1F3864] text-white',  bg: 'bg-[#e8f0f8]', border: 'border-[#3b7abf]', btn: 'bg-[#1F3864] hover:bg-[#2a4a80]' },
  Select:  { badge: 'bg-[#2d4a1e] text-white',  bg: 'bg-[#eaf2e4]', border: 'border-[#5a9e3a]', btn: 'bg-[#2d4a1e] hover:bg-[#3a5f28]' },
  Premier: { badge: 'bg-[#4a1e3a] text-white',  bg: 'bg-[#f5eaf2]', border: 'border-[#9e3a7a]', btn: 'bg-[#4a1e3a] hover:bg-[#5e2a4a]' },
}

export default function PurchaseForm({ tier }: { tier: Tier }) {
  const [quantity, setQuantity] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const c = TIER_STYLES[tier.tier] || TIER_STYLES.Prime
  const total = (tier.price_per_lead * quantity).toFixed(2)

  async function handlePurchase() {
    setError('')
    setLoading(true)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: tier.tier, quantity }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      setLoading(false)
      return
    }
    window.location.href = data.url
  }

  const soldOut = tier.available_count === 0

  return (
    <div className={`rounded-2xl border-2 ${c.border} ${c.bg} p-6 flex flex-col gap-4`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${c.badge}`}>{tier.tier}</span>
        <span className="text-2xl font-bold text-gray-800">
          ${tier.price_per_lead}
          <span className="text-sm font-normal text-gray-500">/lead</span>
        </span>
      </div>

      <p className="text-sm text-gray-600">
        <span className="font-semibold text-gray-800">{tier.available_count}</span> leads available
      </p>

      {!soldOut && (
        <>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity</label>
            <input
              type="number"
              min={1}
              max={tier.available_count}
              value={quantity}
              onChange={e => setQuantity(Math.max(1, Math.min(tier.available_count, parseInt(e.target.value) || 1)))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3864] bg-white"
            />
          </div>

          <div className="bg-white/60 rounded-lg px-4 py-2 text-sm flex justify-between">
            <span className="text-gray-500">Total</span>
            <span className="font-bold text-gray-800">${total}</span>
          </div>
        </>
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <button
        onClick={handlePurchase}
        disabled={loading || soldOut}
        className={`mt-auto text-white rounded-lg py-2.5 font-semibold text-sm transition disabled:opacity-50 ${c.btn}`}
      >
        {soldOut ? 'Sold Out' : loading ? 'Redirecting…' : 'Purchase Leads'}
      </button>
    </div>
  )
}
