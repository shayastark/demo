-- Project Update Reactions MVP
-- Safe to run multiple times
-- Rollback notes:
--   1) DROP TABLE IF EXISTS project_update_reactions CASCADE;

CREATE TABLE IF NOT EXISTS project_update_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES project_updates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('helpful', 'fire', 'agree')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(update_id, user_id, reaction_type)
);

ALTER TABLE project_update_reactions ADD COLUMN IF NOT EXISTS update_id UUID;
ALTER TABLE project_update_reactions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE project_update_reactions ADD COLUMN IF NOT EXISTS reaction_type TEXT;
ALTER TABLE project_update_reactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_update_reactions_update_id_fkey'
      AND conrelid = 'project_update_reactions'::regclass
  ) THEN
    ALTER TABLE project_update_reactions
      ADD CONSTRAINT project_update_reactions_update_id_fkey
      FOREIGN KEY (update_id) REFERENCES project_updates(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_update_reactions_user_id_fkey'
      AND conrelid = 'project_update_reactions'::regclass
  ) THEN
    ALTER TABLE project_update_reactions
      ADD CONSTRAINT project_update_reactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_update_reactions_update_id_user_id_reaction_type_key'
      AND conrelid = 'project_update_reactions'::regclass
  ) THEN
    ALTER TABLE project_update_reactions
      ADD CONSTRAINT project_update_reactions_update_id_user_id_reaction_type_key
      UNIQUE (update_id, user_id, reaction_type);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_update_reactions_reaction_type_check'
      AND conrelid = 'project_update_reactions'::regclass
  ) THEN
    ALTER TABLE project_update_reactions
      ADD CONSTRAINT project_update_reactions_reaction_type_check
      CHECK (reaction_type IN ('helpful', 'fire', 'agree'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_update_reactions_update_id
  ON project_update_reactions(update_id);

CREATE INDEX IF NOT EXISTS idx_project_update_reactions_user_id
  ON project_update_reactions(user_id);

ALTER TABLE project_update_reactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_update_reactions'
      AND policyname = 'Project update reactions are readable'
  ) THEN
    CREATE POLICY "Project update reactions are readable"
      ON project_update_reactions
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
      AND tablename = 'project_update_reactions'
      AND policyname = 'Project update reactions are managed by app logic'
  ) THEN
    DROP POLICY "Project update reactions are managed by app logic" ON project_update_reactions;
  END IF;
END $$;

