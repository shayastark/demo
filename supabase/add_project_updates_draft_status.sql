-- Creator Update Drafts MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) ALTER TABLE project_updates DROP CONSTRAINT IF EXISTS project_updates_status_check;
--   2) ALTER TABLE project_updates DROP COLUMN IF EXISTS published_at;
--   3) ALTER TABLE project_updates DROP COLUMN IF EXISTS status;

ALTER TABLE project_updates
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';

ALTER TABLE project_updates
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_updates_status_check'
      AND conrelid = 'project_updates'::regclass
  ) THEN
    ALTER TABLE project_updates
      ADD CONSTRAINT project_updates_status_check
      CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

UPDATE project_updates
SET status = 'published'
WHERE status IS NULL;

UPDATE project_updates
SET published_at = COALESCE(published_at, created_at, NOW())
WHERE status = 'published'
  AND published_at IS NULL;
