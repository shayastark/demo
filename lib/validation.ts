import 'server-only'

/**
 * Shared input validation utilities for API routes
 */

// UUID v4 format validation
export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

// Ethereum tx hash format
export function isValidTxHash(str: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(str)
}

// Ethereum address format
export function isValidEthAddress(str: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(str)
}

// Validate and clamp a limit parameter (for pagination)
export function parseLimit(raw: string | null, defaultVal = 20, maxVal = 100): number {
  const parsed = parseInt(raw || String(defaultVal), 10)
  if (isNaN(parsed) || parsed < 1) return defaultVal
  return Math.min(parsed, maxVal)
}

// Sanitize a text string: trim and enforce max length
export function sanitizeText(str: string | null | undefined, maxLength: number): string | null {
  if (!str) return null
  return String(str).trim().slice(0, maxLength)
}

// Validate an array of UUIDs (e.g. for batch operations)
export function validateUUIDArray(arr: unknown, maxLength = 100): string[] | null {
  if (!Array.isArray(arr)) return null
  if (arr.length === 0 || arr.length > maxLength) return null
  if (!arr.every((item) => typeof item === 'string' && isValidUUID(item))) return null
  return arr as string[]
}
