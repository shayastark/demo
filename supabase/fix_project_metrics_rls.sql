-- Fix RLS policies for project_metrics to allow INSERT and UPDATE
-- The current schema only allows SELECT, which prevents metrics from being updated

-- Allow anyone to insert metrics (for tracking plays, shares, adds)
CREATE POLICY "Anyone can insert metrics" ON project_metrics
  FOR INSERT WITH CHECK (true);

-- Allow anyone to update metrics (for incrementing plays, shares, adds)
CREATE POLICY "Anyone can update metrics" ON project_metrics
  FOR UPDATE USING (true);

-- The existing SELECT policy is already there:
-- CREATE POLICY "Metrics are viewable by everyone" ON project_metrics
--   FOR SELECT USING (true);

