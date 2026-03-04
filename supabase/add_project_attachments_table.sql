-- Project Attachments MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) DROP TABLE IF EXISTS project_attachments CASCADE;

CREATE TABLE IF NOT EXISTS project_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'file', 'link')),
  title TEXT,
  url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_attachments_project_id_fkey'
      AND conrelid = 'project_attachments'::regclass
  ) THEN
    ALTER TABLE project_attachments
      ADD CONSTRAINT project_attachments_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_attachments_user_id_fkey'
      AND conrelid = 'project_attachments'::regclass
  ) THEN
    ALTER TABLE project_attachments
      ADD CONSTRAINT project_attachments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_attachments_type_check'
      AND conrelid = 'project_attachments'::regclass
  ) THEN
    ALTER TABLE project_attachments
      ADD CONSTRAINT project_attachments_type_check
      CHECK (type IN ('image', 'file', 'link'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_attachments_project_id_created_at_desc
  ON project_attachments(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_attachments_user_id
  ON project_attachments(user_id);

ALTER TABLE project_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_attachments'
      AND policyname = 'Project attachments are readable'
  ) THEN
    CREATE POLICY "Project attachments are readable"
      ON project_attachments
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_attachments'
      AND policyname = 'Project attachments are managed by app logic'
  ) THEN
    DROP POLICY "Project attachments are managed by app logic" ON project_attachments;
  END IF;
END $$;

