// Tier definitions shared by the upload UI (client) and the upload API (server).

export const VALID_TIERS = ['Prime', 'Select', 'Premier', 'Core', 'Essential', 'Data Leads', 'Core 2018-2020', 'Core 2021-2022', 'Core 2023'] as const
export type Tier = (typeof VALID_TIERS)[number]

// Source keyword (in the filename) -> BlyLeads tier. The specific vendor source
// names are checked first so that DATA (the broadest keyword) only matches when
// none of the others do.
export function detectTier(filename: string): Tier | null {
  const upper = filename.toUpperCase()
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
