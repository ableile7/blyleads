// Tier definitions shared by the upload UI (client) and the upload API (server).

export const VALID_TIERS = ['Apex', 'A-Tier', 'Prime', 'Select', 'Premier', 'Core', 'Essential', 'Data Leads', 'Core 2018-2020', 'Core 2021-2022', 'Core 2023', 'Core 2024-2025', 'Essential 2018-2020', 'Essential 2021-2022', 'Essential 2023', 'Essential 2024-2025'] as const
export type Tier = (typeof VALID_TIERS)[number]

// Core and Essential uploads are split into year tiers by each row's record
// date. Years outside the known buckets (or rows with no parseable date) stay
// in the base tier so nothing is guessed.
export function yearTier(base: string, year: number | null): string {
  if (base !== 'Core' && base !== 'Essential') return base
  if (year == null) return base
  if (year >= 2018 && year <= 2020) return `${base} 2018-2020`
  if (year === 2021 || year === 2022) return `${base} 2021-2022`
  if (year === 2023) return `${base} 2023`
  if (year === 2024 || year === 2025) return `${base} 2024-2025`
  return base
}

// Source keyword (in the filename) -> BlyLeads tier. APEX is checked first so an
// Apex file maps to Apex even if it also contains GOLD; DATA is broadest and
// only matches when none of the others do.
export function detectTier(filename: string): Tier | null {
  const upper = filename.toUpperCase()
  if (upper.includes('APEX'))   return 'Apex'
  if (upper.includes('ATIER') || upper.includes('A-TIER')) return 'A-Tier'
  if (upper.includes('BRONZE')) return 'Prime'
  if (upper.includes('COPPER')) return 'Select'
  if (upper.includes('RUBY'))   return 'Premier'
  if (upper.includes('GOLD'))   return 'Core'
  if (upper.includes('SILVER')) return 'Essential'
  if (upper.includes('DATA'))   return 'Data Leads'
  return null
}

export function isValidTier(t: string): t is Tier {
  return (VALID_TIERS as readonly string[]).includes(t)
}

// Display label shown to users (badges, headers). The underlying tier value
// stays stable so leads/pricing/uploads/colors don't need to change.
export const TIER_DISPLAY: Record<string, string> = {
  Apex: 'Apex Core',
  'A-Tier': 'Apex Essential',
}
export function tierLabel(tier: string): string {
  return TIER_DISPLAY[tier] || tier
}
