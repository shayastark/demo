-- Update Draft Scheduling MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) ALTER TABLE project_updates DROP COLUMN IF EXISTS scheduled_publish_at;

ALTER TABLE project_updates
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;
