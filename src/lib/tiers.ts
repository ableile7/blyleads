// Tier definitions shared by the upload UI (client) and the upload API (server).

export const VALID_TIERS = ['Prime', 'Select', 'Premier', 'Core', 'Essential'] as const
export type Tier = (typeof VALID_TIERS)[number]

// Original vendor source name (in the filename) -> BlyLeads tier.
export function detectTier(filename: string): Tier | null {
  const upper = filename.toUpperCase()
  if (upper.includes('BRONZE')) return 'Prime'
  if (upper.includes('COPPER')) return 'Select'
  if (upper.includes('RUBY'))   return 'Premier'
  if (upper.includes('GOLD'))   return 'Core'
  if (upper.includes('SILVER')) return 'Essential'
  return null
}

export function isValidTier(t: string): t is Tier {
  return (VALID_TIERS as readonly string[]).includes(t)
}
