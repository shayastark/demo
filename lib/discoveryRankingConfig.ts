export const DISCOVERY_PREFERENCE_BOOST_WEIGHT = 0.8
export const DISCOVERY_PROJECT_PREFERENCE_BOOST_CAP = 3
export const DISCOVERY_CREATOR_PREFERENCE_BOOST_CAP = 3
export const DISCOVERY_RAW_PREFERENCE_SCORE_CAP = 4

export function capProjectPreferenceBoost(value: number): number {
  return clampNumber(value, 0, DISCOVERY_PROJECT_PREFERENCE_BOOST_CAP)
}

export function capCreatorPreferenceBoost(value: number): number {
  return clampNumber(value, 0, DISCOVERY_CREATOR_PREFERENCE_BOOST_CAP)
}

export function applyPreferenceBoostWeight(value: number): number {
  return Math.max(0, value) * DISCOVERY_PREFERENCE_BOOST_WEIGHT
}

export function roundBoostForAnalytics(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 10) / 10
}

export function shouldLogDiscoveryRankingDiagnostics(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DISCOVERY_RANKING_DEBUG === 'true'
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}
