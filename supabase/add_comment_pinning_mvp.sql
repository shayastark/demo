-- Add pinned most useful comment support.
-- Safe to run multiple times.

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- Normalize existing nulls before index/queries rely on boolean semantics.
UPDATE comments
SET is_pinned = false
WHERE is_pinned IS NULL;

-- Enforce at most one pinned comment per project.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_single_pinned_per_project
  ON comments(project_id)
  WHERE is_pinned = true AND project_id IS NOT NULL;

-- Supporting index for quick pinned lookup in project discussion.
CREATE INDEX IF NOT EXISTS idx_comments_project_pinned_lookup
  ON comments(project_id, is_pinned, created_at DESC);

