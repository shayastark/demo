-- Explore Feedback Loop MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) ALTER TABLE user_discovery_preferences DROP COLUMN IF EXISTS reason_code;
--   2) ALTER TABLE user_discovery_preferences DROP CONSTRAINT IF EXISTS user_discovery_preferences_reason_code_check;

ALTER TABLE user_discovery_preferences
  ADD COLUMN IF NOT EXISTS reason_code TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_discovery_preferences_reason_code_check'
      AND conrelid = 'user_discovery_preferences'::regclass
  ) THEN
    ALTER TABLE user_discovery_preferences
      ADD CONSTRAINT user_discovery_preferences_reason_code_check
      CHECK (
        reason_code IS NULL OR reason_code IN ('not_my_style', 'too_many_updates', 'already_seen', 'other')
      );
  END IF;
END $$;
