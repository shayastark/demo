-- Onboarding Preference Seeding MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) DROP TABLE IF EXISTS user_onboarding_preferences CASCADE;
--   2) DROP FUNCTION IF EXISTS update_user_onboarding_preferences_updated_at();

CREATE TABLE IF NOT EXISTS user_onboarding_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_genres TEXT[] NOT NULL DEFAULT '{}',
  preferred_vibes TEXT[] NOT NULL DEFAULT '{}',
  onboarding_completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_onboarding_preferences
  ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE user_onboarding_preferences
  ADD COLUMN IF NOT EXISTS preferred_genres TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE user_onboarding_preferences
  ADD COLUMN IF NOT EXISTS preferred_vibes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE user_onboarding_preferences
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL;
ALTER TABLE user_onboarding_preferences
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE user_onboarding_preferences
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_onboarding_preferences_user_id_fkey'
      AND conrelid = 'user_onboarding_preferences'::regclass
  ) THEN
    ALTER TABLE user_onboarding_preferences
      ADD CONSTRAINT user_onboarding_preferences_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_onboarding_preferences_user_id_key'
      AND conrelid = 'user_onboarding_preferences'::regclass
  ) THEN
    ALTER TABLE user_onboarding_preferences
      ADD CONSTRAINT user_onboarding_preferences_user_id_key UNIQUE (user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_onboarding_preferences_genres_check'
      AND conrelid = 'user_onboarding_preferences'::regclass
  ) THEN
    ALTER TABLE user_onboarding_preferences
      ADD CONSTRAINT user_onboarding_preferences_genres_check
      CHECK (
        preferred_genres <@ ARRAY[
          'hip_hop','rnb','electronic','indie','pop','rock','ambient','lofi'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_onboarding_preferences_vibes_check'
      AND conrelid = 'user_onboarding_preferences'::regclass
  ) THEN
    ALTER TABLE user_onboarding_preferences
      ADD CONSTRAINT user_onboarding_preferences_vibes_check
      CHECK (
        preferred_vibes <@ ARRAY[
          'high_energy','chill','emotional','experimental','dark','uplifting','minimal','cinematic'
        ]::text[]
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_onboarding_preferences_user_id
  ON user_onboarding_preferences(user_id);

CREATE OR REPLACE FUNCTION update_user_onboarding_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_onboarding_preferences_updated_at ON user_onboarding_preferences;
CREATE TRIGGER update_user_onboarding_preferences_updated_at
  BEFORE UPDATE ON user_onboarding_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_onboarding_preferences_updated_at();

ALTER TABLE user_onboarding_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_onboarding_preferences'
      AND policyname = 'Onboarding preferences are readable'
  ) THEN
    CREATE POLICY "Onboarding preferences are readable"
      ON user_onboarding_preferences
      FOR SELECT
      USING (true);
  END IF;
END $$;
