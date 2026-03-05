import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCreatorPreferenceBoostById,
  buildProjectPreferenceBoostById,
  parseOnboardingPreferencesPatch,
  toOnboardingPreferences,
} from './onboardingPreferences'

test('parseOnboardingPreferencesPatch validates controlled options', () => {
  const valid = parseOnboardingPreferencesPatch({
    preferred_genres: ['hip_hop', 'electronic'],
    preferred_vibes: ['chill'],
    completed: true,
  })
  assert.equal(valid.ok, true)

  const invalidGenre = parseOnboardingPreferencesPatch({
    preferred_genres: ['classical'],
  })
  assert.equal(invalidGenre.ok, false)

  const invalidCompleted = parseOnboardingPreferencesPatch({
    completed: 'yes',
  })
  assert.equal(invalidCompleted.ok, false)
})

test('toOnboardingPreferences keeps backward compatibility defaults', () => {
  const result = toOnboardingPreferences(null)
  assert.deepEqual(result.preferred_genres, [])
  assert.deepEqual(result.preferred_vibes, [])
  assert.equal(result.onboarding_completed_at, null)
})

test('buildProjectPreferenceBoostById scores matching text higher', () => {
  const boosts = buildProjectPreferenceBoostById({
    projects: [
      { id: 'p1', title: 'Ambient Late Night Tape', description: 'cinematic and chill journey' },
      { id: 'p2', title: 'Heavy rock demo', description: 'loud and fast' },
    ],
    preferences: {
      preferred_genres: ['ambient'],
      preferred_vibes: ['cinematic', 'chill'],
    },
  })

  assert.equal(boosts.p1 > boosts.p2, true)
})

test('buildCreatorPreferenceBoostById applies per-creator max matching score', () => {
  const boosts = buildCreatorPreferenceBoostById({
    projects: [
      { creator_id: 'c1', title: 'lofi chill beats', description: null },
      { creator_id: 'c1', title: 'experimental set', description: null },
      { creator_id: 'c2', title: 'rock anthem', description: null },
    ],
    preferences: {
      preferred_genres: ['lofi'],
      preferred_vibes: ['chill'],
    },
  })

  assert.equal((boosts.c1 || 0) > (boosts.c2 || 0), true)
})
