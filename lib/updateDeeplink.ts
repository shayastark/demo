export type UpdateDeeplinkParseResult =
  | { state: 'none'; updateId: null; fromNotification: boolean }
  | { state: 'invalid'; updateId: string; fromNotification: boolean }
  | { state: 'valid'; updateId: string; fromNotification: boolean }

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function parseUpdateDeeplink(search: string): UpdateDeeplinkParseResult {
  const params = new URLSearchParams(search)
  const rawUpdateId = params.get('update_id')
  const fromNotification = params.get('from_notification') === 'true'

  if (!rawUpdateId) {
    return { state: 'none', updateId: null, fromNotification }
  }

  if (!isUuidLike(rawUpdateId)) {
    return { state: 'invalid', updateId: rawUpdateId, fromNotification }
  }

  return { state: 'valid', updateId: rawUpdateId, fromNotification }
}

export function resolveUpdateIdInList(
  updateId: string,
  updates: Array<{ id: string }>
): 'resolved' | 'not_found' {
  return updates.some((update) => update.id === updateId) ? 'resolved' : 'not_found'
}

