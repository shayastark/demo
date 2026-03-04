export function getFollowerDisplayName(rawName?: string | null): string {
  const trimmed = rawName?.trim()
  return trimmed ? trimmed : 'Someone'
}

export function buildFollowerNotificationTitle(rawName?: string | null): string {
  return `${getFollowerDisplayName(rawName)} started following you`
}

export function applyFollowerCountDelta(currentCount: number, didFollow: boolean): number {
  const nextCount = didFollow ? currentCount + 1 : currentCount - 1
  return Math.max(0, nextCount)
}
