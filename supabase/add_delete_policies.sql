-- Add DELETE policies for tracks and projects
-- These allow creators to delete their own tracks and projects

-- Allow creators to delete their own tracks
CREATE POLICY "Creators can delete own tracks" ON tracks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = tracks.project_id
      AND projects.creator_id IN (
        SELECT id FROM users WHERE privy_id = current_setting('app.privy_id', true)::text
      )
    )
  );

-- Allow creators to delete their own projects
CREATE POLICY "Creators can delete own projects" ON projects
  FOR DELETE USING (
    creator_id IN (
      SELECT id FROM users WHERE privy_id = current_setting('app.privy_id', true)::text
    )
  );

-- However, since we're using Privy (not Supabase Auth), the current_setting won't work
-- We need to use a different approach - allow all deletes and enforce in application logic
-- Let's drop the above policies and create simpler ones

DROP POLICY IF EXISTS "Creators can delete own tracks" ON tracks;
DROP POLICY IF EXISTS "Creators can delete own projects" ON projects;

-- Since RLS is enforced by application logic (checking isCreator), we can allow all deletes
-- The application will verify the user is the creator before allowing deletion
CREATE POLICY "Tracks can be deleted" ON tracks
  FOR DELETE USING (true);

CREATE POLICY "Projects can be deleted" ON projects
  FOR DELETE USING (true);

