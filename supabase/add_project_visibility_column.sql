-- Project Visibility MVP (public/unlisted/private)
-- Safe to run multiple times.
-- Rollback notes:
--   1) ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_visibility_check;
--   2) ALTER TABLE projects DROP COLUMN IF EXISTS visibility;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'unlisted';

UPDATE projects
SET visibility = CASE
  WHEN COALESCE(sharing_enabled, true) = true THEN 'unlisted'
  ELSE 'private'
END
WHERE visibility IS NULL OR visibility NOT IN ('public', 'unlisted', 'private');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_visibility_check'
      AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_visibility_check
      CHECK (visibility IN ('public', 'unlisted', 'private'));
  END IF;
END $$;

ALTER TABLE projects
  ALTER COLUMN visibility SET DEFAULT 'unlisted';

