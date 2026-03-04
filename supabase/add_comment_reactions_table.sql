-- Add lightweight comment reactions (MVP: helpful/fire/agree).
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comment_reactions_unique UNIQUE (comment_id, user_id, reaction_type),
  CONSTRAINT comment_reactions_type_check CHECK (reaction_type IN ('helpful', 'fire', 'agree'))
);

-- Remove legacy single-reaction-per-comment rows outside supported reaction set.
DELETE FROM comment_reactions
WHERE reaction_type NOT IN ('helpful', 'fire', 'agree');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comment_reactions_unique'
      AND conrelid = 'comment_reactions'::regclass
  ) THEN
    ALTER TABLE comment_reactions DROP CONSTRAINT comment_reactions_unique;
  END IF;

  ALTER TABLE comment_reactions
    ADD CONSTRAINT comment_reactions_unique UNIQUE (comment_id, user_id, reaction_type);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comment_reactions_type_check'
      AND conrelid = 'comment_reactions'::regclass
  ) THEN
    ALTER TABLE comment_reactions DROP CONSTRAINT comment_reactions_type_check;
  END IF;

  ALTER TABLE comment_reactions
    ADD CONSTRAINT comment_reactions_type_check CHECK (reaction_type IN ('helpful', 'fire', 'agree'));
END $$;

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id
  ON comment_reactions(comment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id
  ON comment_reactions(user_id, created_at DESC);

ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comment_reactions'
      AND policyname = 'Comment reactions are readable'
  ) THEN
    CREATE POLICY "Comment reactions are readable"
      ON comment_reactions
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  -- Remove any legacy permissive write policy if present.
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comment_reactions'
      AND policyname = 'Comment reactions are managed by app logic'
  ) THEN
    DROP POLICY "Comment reactions are managed by app logic" ON comment_reactions;
  END IF;
END $$;
