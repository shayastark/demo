-- Project Collaborator Roles MVP
-- Safe to run multiple times.
-- Rollback notes:
--   1) DROP INDEX IF EXISTS idx_project_access_grants_role;
--   2) ALTER TABLE project_access_grants DROP CONSTRAINT IF EXISTS project_access_grants_role_check;
--   3) ALTER TABLE project_access_grants DROP COLUMN IF EXISTS role;

ALTER TABLE project_access_grants
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer';

UPDATE project_access_grants
SET role = 'viewer'
WHERE role IS NULL OR role NOT IN ('viewer', 'commenter', 'contributor');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_access_grants_role_check'
      AND conrelid = 'project_access_grants'::regclass
  ) THEN
    ALTER TABLE project_access_grants
      ADD CONSTRAINT project_access_grants_role_check
      CHECK (role IN ('viewer', 'commenter', 'contributor'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_access_grants_role
  ON project_access_grants(role);
