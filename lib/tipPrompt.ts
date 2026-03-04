export type TipPromptSource = 'project_detail' | 'shared_project'
export type TipPromptTrigger = 'playback_threshold' | 'comment_post'

export const TIP_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000

export function getTipPromptDismissKey(projectId: string, viewerKey: string): string {
  return `demo:tip_prompt:dismissed:${projectId}:${viewerKey}`
}

export function getTipPromptConvertedKey(projectId: string, viewerKey: string): string {
  return `demo:tip_prompt:converted:${projectId}:${viewerKey}`
}

export function getDismissedUntil(nowMs: number, cooldownMs = TIP_PROMPT_COOLDOWN_MS): number {
  return nowMs + cooldownMs
}

export function isDismissedActive(dismissedUntil: number | null, nowMs: number): boolean {
  return typeof dismissedUntil === 'number' && dismissedUntil > nowMs
}

export function parseStoredTimestamp(raw: string | null): number | null {
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export function shouldShowTipPrompt(params: {
  authenticated: boolean
  isCreator: boolean
  trigger: TipPromptTrigger | null
  dismissedUntil: number | null
  convertedInSession: boolean
  nowMs: number
}): boolean {
  if (!params.authenticated) return false
  if (params.isCreator) return false
  if (!params.trigger) return false
  if (params.convertedInSession) return false
  if (isDismissedActive(params.dismissedUntil, params.nowMs)) return false
  return true
}

export function markTipPromptDismissed(projectId: string, viewerKey: string, nowMs: number, cooldownMs = TIP_PROMPT_COOLDOWN_MS): void {
  if (typeof window === 'undefined') return
  const key = getTipPromptDismissKey(projectId, viewerKey)
  window.localStorage.setItem(key, String(getDismissedUntil(nowMs, cooldownMs)))
}

export function getTipPromptDismissedUntil(projectId: string, viewerKey: string): number | null {
  if (typeof window === 'undefined') return null
  return parseStoredTimestamp(window.localStorage.getItem(getTipPromptDismissKey(projectId, viewerKey)))
}

export function markTipPromptConvertedInSession(projectId: string, viewerKey: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(getTipPromptConvertedKey(projectId, viewerKey), '1')
}

export function hasTipPromptConvertedInSession(projectId: string, viewerKey: string): boolean {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(getTipPromptConvertedKey(projectId, viewerKey)) === '1'
}

