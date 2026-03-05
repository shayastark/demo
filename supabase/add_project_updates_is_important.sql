-- Mark Update as Important MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) ALTER TABLE project_updates DROP COLUMN IF EXISTS is_important;

ALTER TABLE project_updates
  ADD COLUMN IF NOT EXISTS is_important BOOLEAN NOT NULL DEFAULT false;
