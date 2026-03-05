-- Notification Digest Mode MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) ALTER TABLE notification_preferences DROP COLUMN IF EXISTS digest_window;
--   2) ALTER TABLE notification_preferences DROP COLUMN IF EXISTS delivery_mode;
--   3) ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_mode_check;
--   4) ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_digest_window_check;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'instant';

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS digest_window TEXT NOT NULL DEFAULT 'daily';

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
