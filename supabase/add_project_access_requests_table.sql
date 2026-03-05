-- Project Access Request MVP
-- Safe to run multiple times.
-- Rollback notes:
--   1) DROP TABLE IF EXISTS project_access_requests CASCADE;
--   2) DROP FUNCTION IF EXISTS update_project_access_requests_updated_at();

CREATE TABLE IF NOT EXISTS project_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (project_id, requester_user_id)
);

ALTER TABLE project_access_requests ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE project_access_requests ADD COLUMN IF NOT EXISTS requester_user_id UUID;
ALTER TABLE project_access_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE project_access_requests ADD COLUMN IF NOT EXISTS note TEXT NULL;
ALTER TABLE project_access_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE project_access_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE project_access_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL;
ALTER TABLE project_access_requests ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_access_requests_project_id_fkey'
      AND conrelid = 'project_access_requests'::regclass
  ) THEN
    ALTER TABLE project_access_requests
      ADD CONSTRAINT project_access_requests_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_access_requests_requester_user_id_fkey'
      AND conrelid = 'project_access_requests'::regclass
  ) THEN
    ALTER TABLE project_access_requests
      ADD CONSTRAINT project_access_requests_requester_user_id_fkey
      FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_access_requests_reviewed_by_user_id_fkey'
      AND conrelid = 'project_access_requests'::regclass
  ) THEN
    ALTER TABLE project_access_requests
      ADD CONSTRAINT project_access_requests_reviewed_by_user_id_fkey
      FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_access_requests_status_check'
      AND conrelid = 'project_access_requests'::regclass
  ) THEN
    ALTER TABLE project_access_requests
      ADD CONSTRAINT project_access_requests_status_check
      CHECK (status IN ('pending', 'approved', 'denied'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS project_access_requests_project_id_requester_user_id_unique
  ON project_access_requests(project_id, requester_user_id);

CREATE INDEX IF NOT EXISTS idx_project_access_requests_project_id_status
  ON project_access_requests(project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_access_requests_requester_status
  ON project_access_requests(requester_user_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION update_project_access_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_project_access_requests_updated_at ON project_access_requests;
CREATE TRIGGER update_project_access_requests_updated_at
  BEFORE UPDATE ON project_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_project_access_requests_updated_at();

ALTER TABLE project_access_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_access_requests'
      AND policyname = 'Project access requests are readable'
  ) THEN
    CREATE POLICY "Project access requests are readable"
      ON project_access_requests
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_access_requests'
      AND policyname = 'Project access requests are managed by app logic'
  ) THEN
    DROP POLICY "Project access requests are managed by app logic" ON project_access_requests;
  END IF;
END $$;
