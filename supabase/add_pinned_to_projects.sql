-- Add pinned column to projects table (for creator's own projects)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false;

-- Create index for faster querying of pinned projects
CREATE INDEX IF NOT EXISTS idx_projects_pinned ON projects(creator_id, pinned) WHERE pinned = true;

