-- Private Project Access MVP
-- Safe to run multiple times.
-- Rollback notes:
--   1) DROP TABLE IF EXISTS project_access_grants CASCADE;

CREATE TABLE IF NOT EXISTS project_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE project_access_grants ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE project_access_grants ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE project_access_grants ADD COLUMN IF NOT EXISTS granted_by_user_id UUID;
ALTER TABLE project_access_grants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_access_grants_project_id_fkey'
      AND conrelid = 'project_access_grants'::regclass
  ) THEN
    ALTER TABLE project_access_grants
      ADD CONSTRAINT project_access_grants_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_access_grants_user_id_fkey'
      AND conrelid = 'project_access_grants'::regclass
  ) THEN
    ALTER TABLE project_access_grants
      ADD CONSTRAINT project_access_grants_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_access_grants_granted_by_user_id_fkey'
      AND conrelid = 'project_access_grants'::regclass
  ) THEN
    ALTER TABLE project_access_grants
      ADD CONSTRAINT project_access_grants_granted_by_user_id_fkey
      FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS project_access_grants_project_id_user_id_unique
  ON project_access_grants(project_id, user_id);

CREATE INDEX IF NOT EXISTS idx_project_access_grants_project_id
  ON project_access_grants(project_id);

CREATE INDEX IF NOT EXISTS idx_project_access_grants_user_id
  ON project_access_grants(user_id);

ALTER TABLE project_access_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_access_grants'
      AND policyname = 'Project access grants are readable'
  ) THEN
    CREATE POLICY "Project access grants are readable"
      ON project_access_grants
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_access_grants'
      AND policyname = 'Project access grants are managed by app logic'
  ) THEN
    DROP POLICY "Project access grants are managed by app logic" ON project_access_grants;
  END IF;
END $$;

