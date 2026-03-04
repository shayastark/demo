-- Add creator follow graph for social loops.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_follows_unique UNIQUE (follower_id, following_id),
  CONSTRAINT user_follows_no_self_follow CHECK (follower_id <> following_id)
);

DO $$
BEGIN
  -- Backward-compat: if an earlier migration used followed_id, rename it.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_follows'
      AND column_name = 'followed_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_follows'
      AND column_name = 'following_id'
  ) THEN
    ALTER TABLE user_follows RENAME COLUMN followed_id TO following_id;
  END IF;
END $$;

-- Ensure required columns exist.
ALTER TABLE user_follows ADD COLUMN IF NOT EXISTS follower_id UUID;
ALTER TABLE user_follows ADD COLUMN IF NOT EXISTS following_id UUID;
ALTER TABLE user_follows ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Clean up malformed/duplicate rows before enforcing constraints.
DELETE FROM user_follows
WHERE follower_id IS NULL
   OR following_id IS NULL
   OR follower_id = following_id;

DELETE FROM user_follows uf
USING user_follows dupe
WHERE uf.id < dupe.id
  AND uf.follower_id = dupe.follower_id
  AND uf.following_id = dupe.following_id;

-- Ensure foreign keys exist with predictable names.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_follows_follower_id_fkey'
      AND conrelid = 'user_follows'::regclass
  ) THEN
    ALTER TABLE user_follows
      ADD CONSTRAINT user_follows_follower_id_fkey
      FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_follows_following_id_fkey'
      AND conrelid = 'user_follows'::regclass
  ) THEN
    ALTER TABLE user_follows
      ADD CONSTRAINT user_follows_following_id_fkey
      FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Recreate check/unique constraints in canonical form.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_follows_unique'
      AND conrelid = 'user_follows'::regclass
  ) THEN
    ALTER TABLE user_follows DROP CONSTRAINT user_follows_unique;
  END IF;

  ALTER TABLE user_follows
    ADD CONSTRAINT user_follows_unique UNIQUE (follower_id, following_id);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_follows_no_self_follow'
      AND conrelid = 'user_follows'::regclass
  ) THEN
    ALTER TABLE user_follows DROP CONSTRAINT user_follows_no_self_follow;
  END IF;

  ALTER TABLE user_follows
    ADD CONSTRAINT user_follows_no_self_follow CHECK (follower_id <> following_id);
END $$;

CREATE INDEX IF NOT EXISTS idx_user_follows_follower_id
  ON user_follows(follower_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_follows_following_id
  ON user_follows(following_id, created_at DESC);

DROP INDEX IF EXISTS idx_user_follows_followed_id;

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_follows'
      AND policyname = 'User follows are readable'
  ) THEN
    CREATE POLICY "User follows are readable"
      ON user_follows
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  -- Remove legacy permissive write policy if present.
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_follows'
      AND policyname = 'User follows are managed by app logic'
  ) THEN
    DROP POLICY "User follows are managed by app logic" ON user_follows;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_follows'
      AND policyname = 'User follows are readable'
  ) THEN
    CREATE POLICY "User follows are readable"
      ON user_follows
      FOR SELECT
      USING (true);
  END IF;
END $$;
