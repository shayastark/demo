-- Add creator project updates timeline.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS project_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  version_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS version_label TEXT;
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_updates_project_id_fkey'
      AND conrelid = 'project_updates'::regclass
  ) THEN
    ALTER TABLE project_updates
      ADD CONSTRAINT project_updates_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_updates_user_id_fkey'
      AND conrelid = 'project_updates'::regclass
  ) THEN
    ALTER TABLE project_updates
      ADD CONSTRAINT project_updates_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_updates_project_id_created_at_desc
  ON project_updates(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_updates_user_id
  ON project_updates(user_id);

CREATE OR REPLACE FUNCTION update_project_updates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_project_updates_updated_at ON project_updates;
CREATE TRIGGER update_project_updates_updated_at
  BEFORE UPDATE ON project_updates
  FOR EACH ROW
  EXECUTE FUNCTION update_project_updates_updated_at();

ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_updates'
      AND policyname = 'Project updates are readable'
  ) THEN
    CREATE POLICY "Project updates are readable"
      ON project_updates
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
      AND tablename = 'project_updates'
      AND policyname = 'Project updates are managed by app logic'
  ) THEN
    DROP POLICY "Project updates are managed by app logic" ON project_updates;
  END IF;
END $$;

