-- Add project-scoped supporter derivation fields to tips.
-- Safe to run multiple times.

ALTER TABLE tips
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE tips
  ADD COLUMN IF NOT EXISTS tipper_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tips_project_tipper_status
  ON tips(project_id, tipper_user_id, status, created_at DESC);

