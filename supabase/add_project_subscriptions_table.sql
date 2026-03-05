-- Project Watch/Subscribe MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) DROP TABLE IF EXISTS project_subscriptions CASCADE;

CREATE TABLE IF NOT EXISTS project_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);

ALTER TABLE project_subscriptions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE project_subscriptions ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE project_subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_subscriptions_user_id_fkey'
      AND conrelid = 'project_subscriptions'::regclass
  ) THEN
    ALTER TABLE project_subscriptions
      ADD CONSTRAINT project_subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_subscriptions_project_id_fkey'
      AND conrelid = 'project_subscriptions'::regclass
  ) THEN
    ALTER TABLE project_subscriptions
      ADD CONSTRAINT project_subscriptions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_subscriptions_user_id_project_id_key'
      AND conrelid = 'project_subscriptions'::regclass
  ) THEN
    ALTER TABLE project_subscriptions
      ADD CONSTRAINT project_subscriptions_user_id_project_id_key
      UNIQUE (user_id, project_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_subscriptions_user_id
  ON project_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_project_subscriptions_project_id
  ON project_subscriptions(project_id);

ALTER TABLE project_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_subscriptions'
      AND policyname = 'Project subscriptions are readable'
  ) THEN
    CREATE POLICY "Project subscriptions are readable"
      ON project_subscriptions
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
      AND tablename = 'project_subscriptions'
      AND policyname = 'Project subscriptions are managed by app logic'
  ) THEN
    DROP POLICY "Project subscriptions are managed by app logic" ON project_subscriptions;
  END IF;
END $$;

