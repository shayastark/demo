import { roundBoostForAnalytics } from '@/lib/discoveryRankingConfig'

export function buildDiscoveryImpactEventFields(args: {
  preferenceSeedBoost: number | null | undefined
  sortMode: string | null | undefined
  positionIndex: number
}) {
  const numericBoost =
    typeof args.preferenceSeedBoost === 'number' && Number.isFinite(args.preferenceSeedBoost)
      ? args.preferenceSeedBoost
      : 0
  return {
    used_preference_seed: numericBoost > 0,
    boost_applied: roundBoostForAnalytics(numericBoost),
    sort_mode: args.sortMode || 'default',
    position_index: args.positionIndex,
  }
}
