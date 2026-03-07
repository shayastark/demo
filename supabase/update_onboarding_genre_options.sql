-- Update onboarding genre options.
-- Safe to run multiple times.
-- Rollback notes:
--   1) Restore previous genres_check constraint values if needed.
--   2) Re-add any removed options to app constants before rollback.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_onboarding_preferences_genres_check'
      AND conrelid = 'user_onboarding_preferences'::regclass
  ) THEN
    ALTER TABLE user_onboarding_preferences
      DROP CONSTRAINT user_onboarding_preferences_genres_check;
  END IF;
END $$;

-- Remove retired genre values from existing rows before re-adding check.
UPDATE user_onboarding_preferences
SET preferred_genres = (
  SELECT COALESCE(array_agg(genre), '{}'::text[])
  FROM (
    SELECT DISTINCT genre
    FROM unnest(COALESCE(preferred_genres, '{}'::text[])) AS genre
    WHERE genre = ANY(
      ARRAY[
        'hip_hop','rnb','electronic','indie','pop','rock',
        'alternative','country','dance','latin','soul_funk','blues',
        'jazz','gospel','reggae','afrobeats','metal','classical'
      ]::text[]
    )
  ) valid
);

ALTER TABLE user_onboarding_preferences
  ADD CONSTRAINT user_onboarding_preferences_genres_check
  CHECK (
    preferred_genres <@ ARRAY[
      'hip_hop','rnb','electronic','indie','pop','rock',
      'alternative','country','dance','latin','soul_funk','blues',
      'jazz','gospel','reggae','afrobeats','metal','classical'
    ]::text[]
  );
