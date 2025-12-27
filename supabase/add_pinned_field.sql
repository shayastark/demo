-- Add pinned field to user_projects table
ALTER TABLE user_projects
ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false;

-- Create index for pinned projects
CREATE INDEX IF NOT EXISTS idx_user_projects_pinned ON user_projects(user_id, pinned) WHERE pinned = true;

