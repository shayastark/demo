-- Notification preferences schema hardening
-- Safe to run multiple times.
-- Purpose:
--   1) Ensure required table/columns exist
--   2) Ensure one row per user for deterministic updates
--   3) Ensure digest columns/constraints exist for delivery mode UI
--
-- Rollback notes:
--   1) ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_user_id_key;
--   2) ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_mode_check;
--   3) ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_digest_window_check;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notify_new_follower BOOLEAN NOT NULL DEFAULT true,
  notify_project_updates BOOLEAN NOT NULL DEFAULT true,
  notify_tips BOOLEAN NOT NULL DEFAULT true,
  notify_project_saved BOOLEAN NOT NULL DEFAULT true,
  delivery_mode TEXT NOT NULL DEFAULT 'instant',
  digest_window TEXT NOT NULL DEFAULT 'daily',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS notify_new_follower BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS notify_project_updates BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS notify_tips BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS notify_project_saved BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'instant';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS digest_window TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_user_id_fkey'
      AND conrelid = 'notification_preferences'::regclass
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Keep newest row per user so a unique constraint can be added safely.
WITH ranked AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM notification_preferences
  WHERE user_id IS NOT NULL
)
DELETE FROM notification_preferences np
USING ranked r
WHERE np.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_user_id_key'
      AND conrelid = 'notification_preferences'::regclass
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_delivery_mode_check'
      AND conrelid = 'notification_preferences'::regclass
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_delivery_mode_check
      CHECK (delivery_mode IN ('instant', 'digest'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_digest_window_check'
      AND conrelid = 'notification_preferences'::regclass
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_digest_window_check
      CHECK (digest_window IN ('daily', 'weekly'));
  END IF;
END $$;
