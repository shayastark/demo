-- Project Access Expiration MVP
-- Safe to run multiple times.
-- Rollback notes:
--   1) DROP INDEX IF EXISTS idx_project_access_grants_expires_at;
--   2) ALTER TABLE project_access_grants DROP COLUMN IF EXISTS expires_at;

ALTER TABLE project_access_grants
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_project_access_grants_expires_at
  ON project_access_grants(expires_at);
