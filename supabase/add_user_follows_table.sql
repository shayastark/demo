-- Add creator follow graph for social loops.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_follows_unique UNIQUE (follower_id, followed_id),
  CONSTRAINT user_follows_no_self_follow CHECK (follower_id <> followed_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower_id
  ON user_follows(follower_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_follows_followed_id
  ON user_follows(followed_id, created_at DESC);

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
