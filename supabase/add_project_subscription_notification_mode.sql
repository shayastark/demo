-- Project Notification Settings MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) ALTER TABLE project_subscriptions DROP CONSTRAINT IF EXISTS project_subscriptions_notification_mode_check;
--   2) ALTER TABLE project_subscriptions DROP COLUMN IF EXISTS notification_mode;

ALTER TABLE project_subscriptions
  ADD COLUMN IF NOT EXISTS notification_mode TEXT NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_subscriptions_notification_mode_check'
      AND conrelid = 'project_subscriptions'::regclass
  ) THEN
    ALTER TABLE project_subscriptions
      ADD CONSTRAINT project_subscriptions_notification_mode_check
      CHECK (notification_mode IN ('all', 'important', 'mute'));
  END IF;
END $$;
