-- Notification Snooze MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) DROP TABLE IF EXISTS notification_snoozes CASCADE;
--   2) DROP FUNCTION IF EXISTS update_notification_snoozes_updated_at();

CREATE TABLE IF NOT EXISTS notification_snoozes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL,
  snoozed_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_snoozes_user_scope_key UNIQUE (user_id, scope_key)
);

ALTER TABLE notification_snoozes ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE notification_snoozes ADD COLUMN IF NOT EXISTS scope_key TEXT;
ALTER TABLE notification_snoozes ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
ALTER TABLE notification_snoozes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notification_snoozes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_snoozes_user_id_fkey'
      AND conrelid = 'notification_snoozes'::regclass
  ) THEN
    ALTER TABLE notification_snoozes
      ADD CONSTRAINT notification_snoozes_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_snoozes_user_scope_key'
      AND conrelid = 'notification_snoozes'::regclass
  ) THEN
    ALTER TABLE notification_snoozes
      ADD CONSTRAINT notification_snoozes_user_scope_key UNIQUE (user_id, scope_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_snoozes_user_id
  ON notification_snoozes(user_id);

CREATE INDEX IF NOT EXISTS idx_notification_snoozes_snoozed_until
  ON notification_snoozes(snoozed_until DESC);

CREATE OR REPLACE FUNCTION update_notification_snoozes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_notification_snoozes_updated_at ON notification_snoozes;
CREATE TRIGGER update_notification_snoozes_updated_at
  BEFORE UPDATE ON notification_snoozes
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_snoozes_updated_at();

ALTER TABLE notification_snoozes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_snoozes'
      AND policyname = 'Notification snoozes are readable'
  ) THEN
    CREATE POLICY "Notification snoozes are readable"
      ON notification_snoozes
      FOR SELECT
      USING (true);
  END IF;
END $$;
