-- Project Update Comments MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) DROP TABLE IF EXISTS project_update_comments CASCADE;

CREATE TABLE IF NOT EXISTS project_update_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES project_updates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_update_comments ADD COLUMN IF NOT EXISTS update_id UUID;
ALTER TABLE project_update_comments ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE project_update_comments ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE project_update_comments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE project_update_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_update_comments_update_id_fkey'
      AND conrelid = 'project_update_comments'::regclass
  ) THEN
    ALTER TABLE project_update_comments
      ADD CONSTRAINT project_update_comments_update_id_fkey
      FOREIGN KEY (update_id) REFERENCES project_updates(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_update_comments_user_id_fkey'
      AND conrelid = 'project_update_comments'::regclass
  ) THEN
    ALTER TABLE project_update_comments
      ADD CONSTRAINT project_update_comments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_update_comments_update_id_created_at
  ON project_update_comments(update_id, created_at);

CREATE INDEX IF NOT EXISTS idx_project_update_comments_user_id
  ON project_update_comments(user_id);

CREATE OR REPLACE FUNCTION update_project_update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_project_update_comments_updated_at ON project_update_comments;
CREATE TRIGGER update_project_update_comments_updated_at
  BEFORE UPDATE ON project_update_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_project_update_comments_updated_at();

ALTER TABLE project_update_comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_update_comments'
      AND policyname = 'Project update comments are readable'
  ) THEN
    CREATE POLICY "Project update comments are readable"
      ON project_update_comments
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
      AND tablename = 'project_update_comments'
      AND policyname = 'Project update comments are managed by app logic'
  ) THEN
    DROP POLICY "Project update comments are managed by app logic" ON project_update_comments;
  END IF;
END $$;

