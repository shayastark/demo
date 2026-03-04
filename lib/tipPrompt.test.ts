import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getTipPromptDismissKey,
  getTipPromptConvertedKey,
  getDismissedUntil,
  isDismissedActive,
  parseStoredTimestamp,
  shouldShowTipPrompt,
  TIP_PROMPT_COOLDOWN_MS,
} from './tipPrompt'

test('tip prompt storage keys are project+viewer scoped', () => {
  assert.equal(
    getTipPromptDismissKey('p1', 'u1'),
    'demo:tip_prompt:dismissed:p1:u1'
  )
  assert.equal(
    getTipPromptConvertedKey('p1', 'u1'),
    'demo:tip_prompt:converted:p1:u1'
  )
})

test('dismissed window math and parser are safe', () => {
  const now = 1000
  assert.equal(getDismissedUntil(now), now + TIP_PROMPT_COOLDOWN_MS)
  assert.equal(isDismissedActive(now + 5000, now), true)
  assert.equal(isDismissedActive(now - 1, now), false)
  assert.equal(parseStoredTimestamp('123'), 123)
  assert.equal(parseStoredTimestamp('bad'), null)
  assert.equal(parseStoredTimestamp(null), null)
})

test('shouldShowTipPrompt enforces eligibility and suppression', () => {
  const base = {
    authenticated: true,
    isCreator: false,
    trigger: 'comment_post' as const,
    dismissedUntil: null,
    convertedInSession: false,
    nowMs: 100,
  }

  assert.equal(shouldShowTipPrompt(base), true)
  assert.equal(shouldShowTipPrompt({ ...base, authenticated: false }), false)
  assert.equal(shouldShowTipPrompt({ ...base, isCreator: true }), false)
  assert.equal(shouldShowTipPrompt({ ...base, trigger: null }), false)
  assert.equal(shouldShowTipPrompt({ ...base, convertedInSession: true }), false)
  assert.equal(shouldShowTipPrompt({ ...base, dismissedUntil: 101 }), false)
})

