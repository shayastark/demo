-- Explore Personalization MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) DROP TABLE IF EXISTS user_discovery_preferences CASCADE;

CREATE TABLE IF NOT EXISTS user_discovery_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  preference TEXT NOT NULL DEFAULT 'hide',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_discovery_preferences ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE user_discovery_preferences ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE user_discovery_preferences ADD COLUMN IF NOT EXISTS target_id UUID;
ALTER TABLE user_discovery_preferences ADD COLUMN IF NOT EXISTS preference TEXT NOT NULL DEFAULT 'hide';
ALTER TABLE user_discovery_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_discovery_preferences_user_id_fkey'
      AND conrelid = 'user_discovery_preferences'::regclass
  ) THEN
    ALTER TABLE user_discovery_preferences
      ADD CONSTRAINT user_discovery_preferences_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_discovery_preferences_target_type_check'
      AND conrelid = 'user_discovery_preferences'::regclass
  ) THEN
    ALTER TABLE user_discovery_preferences
      ADD CONSTRAINT user_discovery_preferences_target_type_check
      CHECK (target_type IN ('project', 'creator'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_discovery_preferences_preference_check'
      AND conrelid = 'user_discovery_preferences'::regclass
  ) THEN
    ALTER TABLE user_discovery_preferences
      ADD CONSTRAINT user_discovery_preferences_preference_check
      CHECK (preference IN ('hide'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_discovery_preferences_unique_user_target_pref'
      AND conrelid = 'user_discovery_preferences'::regclass
  ) THEN
    ALTER TABLE user_discovery_preferences
      ADD CONSTRAINT user_discovery_preferences_unique_user_target_pref
      UNIQUE (user_id, target_type, target_id, preference);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_udp_user_type_pref
  ON user_discovery_preferences(user_id, target_type, preference);

CREATE INDEX IF NOT EXISTS idx_udp_user_target
  ON user_discovery_preferences(user_id, target_type, target_id);

ALTER TABLE user_discovery_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_discovery_preferences'
      AND policyname = 'User discovery preferences are readable'
  ) THEN
    CREATE POLICY "User discovery preferences are readable"
      ON user_discovery_preferences
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_discovery_preferences'
      AND policyname = 'User discovery preferences are managed by app logic'
  ) THEN
    DROP POLICY "User discovery preferences are managed by app logic" ON user_discovery_preferences;
  END IF;
END $$;
