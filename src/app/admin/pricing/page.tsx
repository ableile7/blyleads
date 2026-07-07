import { createAdminClient } from '@/lib/supabase/server'
import PricingForm from './PricingForm'

export default async function AdminPricingPage() {
  const supabase = createAdminClient()
  const { data: pricing } = await supabase.from('pricing').select('*').order('tier')

  // ELG prices live in the service-role-only pricing_elg table (013); join
  // them into the form. Errors ignored so the page renders pre-migration.
  const { data: elg } = await supabase.from('pricing_elg').select('*')
  const elgMap: Record<string, number> = {}
  for (const row of elg || []) elgMap[row.tier] = Number(row.price_per_lead)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Pricing</h2>
      <p className="text-gray-500 text-sm mb-8">Set the price per lead for each tier. Changes take effect immediately.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pricing?.map(tier => (
          <PricingForm key={tier.tier} tier={{ ...tier, elg_price_per_lead: elgMap[tier.tier] ?? null }} />
        ))}
      </div>
    </div>
  )
}
