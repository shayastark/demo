-- Create comments table for project-level feedback if missing.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  timestamp_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure required columns exist when table was created with an older shape.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS track_id UUID;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS timestamp_seconds INTEGER;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Guardrails used by the API and UI.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comments_target_check'
      AND conrelid = 'comments'::regclass
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_target_check CHECK (
        (project_id IS NOT NULL AND track_id IS NULL) OR
        (project_id IS NULL AND track_id IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comments_track_timestamp_check'
      AND conrelid = 'comments'::regclass
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_track_timestamp_check CHECK (
        (track_id IS NULL AND timestamp_seconds IS NULL) OR
        (track_id IS NOT NULL AND timestamp_seconds IS NOT NULL AND timestamp_seconds >= 0)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_track_id ON comments(track_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- Keep updated_at in sync.
CREATE OR REPLACE FUNCTION update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_comments_updated_at ON comments;
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_comments_updated_at();

