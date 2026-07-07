'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { tierLabel } from '@/lib/tiers'

type Tier = { tier: string; price_per_lead: number; elg_price_per_lead: number | null; available_count: number; is_active: boolean }

const TIER_STYLES: Record<string, string> = {
  Prime:     'border-[#3b7abf] bg-[#e8f0f8]',
  Select:    'border-[#5a9e3a] bg-[#eaf2e4]',
  Premier:   'border-[#9e3a7a] bg-[#f5eaf2]',
  Core:      'border-[#c9a227] bg-[#fbf3d9]',
  Essential: 'border-[#8a97a8] bg-[#eef1f4]',
  'Data Leads': 'border-[#0f9e8e] bg-[#d6f3ef]',
  'Core 2018-2020': 'border-[#c9a227] bg-[#fbf3d9]',
  'Core 2021-2022': 'border-[#c9a227] bg-[#fbf3d9]',
  'Core 2023': 'border-[#c9a227] bg-[#fbf3d9]',
  Apex: 'border-[#e0b020] bg-gradient-to-br from-[#fff1c2] to-[#ffe49a]',
  'A-Tier': 'border-[#9aa3ad] bg-gradient-to-br from-[#eef0f2] to-[#dce0e5]',
}

export default function PricingForm({ tier }: { tier: Tier }) {
  const router = useRouter()
  const [price, setPrice] = useState(String(tier.price_per_lead))
  const [elgPrice, setElgPrice] = useState(tier.elg_price_per_lead == null ? '' : String(tier.elg_price_per_lead))
  const [availableCount, setAvailableCount] = useState(String(tier.available_count))
  const [active, setActive] = useState(tier.is_active)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    await fetch('/api/admin/pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier: tier.tier,
        price_per_lead: parseFloat(price),
        elg_price_per_lead: elgPrice.trim() === '' ? null : parseFloat(elgPrice),
        available_count: parseInt(availableCount) || 0,
        is_active: active,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  return (
    <div className={`rounded-2xl border-2 p-6 flex flex-col gap-4 ${TIER_STYLES[tier.tier] || 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-800 text-lg">{tierLabel(tier.tier)}</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
            className="w-4 h-4 accent-[#1F3864]" />
          <span className="text-sm text-gray-600">Active</span>
        </label>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Price per Lead ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={e => setPrice(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">ELG Price per Lead ($) — blank = standard</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={elgPrice}
          placeholder={price}
          onChange={e => setElgPrice(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Available Count</label>
        <input
          type="number"
          min="0"
          value={availableCount}
          onChange={e => setAvailableCount(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
        />
      </div>
      <button onClick={handleSave} disabled={saving}
        className="bg-[#1F3864] text-white rounded-lg py-2.5 font-semibold text-sm hover:bg-[#2a4a80] transition disabled:opacity-50">
        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Price'}
      </button>
    </div>
  )
}
