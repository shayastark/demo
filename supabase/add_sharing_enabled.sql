-- Add sharing_enabled column to projects table
-- This allows creators to enable/disable sharing for their projects

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS sharing_enabled BOOLEAN DEFAULT true;

-- Update existing projects to have sharing enabled by default
UPDATE projects 
SET sharing_enabled = true 
WHERE sharing_enabled IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN projects.sharing_enabled IS 'Whether the project can be viewed via share link. Defaults to true.';

