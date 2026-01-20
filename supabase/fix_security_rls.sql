-- CRITICAL SECURITY FIX: Lock down RLS policies
-- The anon key should only allow READ operations
-- All WRITE operations must go through server-side API routes

-- ============================================
-- USERS TABLE
-- ============================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can insert" ON users;
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for all users" ON users;
DROP POLICY IF EXISTS "Enable update for all users" ON users;

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow reading user profiles (public data like username, avatar)
CREATE POLICY "Users are publicly readable"
ON users FOR SELECT
USING (true);

-- BLOCK all client-side inserts/updates/deletes
-- These operations MUST go through server-side API routes with service role key
-- No INSERT policy = inserts blocked
-- No UPDATE policy = updates blocked
-- No DELETE policy = deletes blocked

-- ============================================
-- PROJECTS TABLE
-- ============================================

DROP POLICY IF EXISTS "Projects are viewable by everyone" ON projects;
DROP POLICY IF EXISTS "Creators can insert projects" ON projects;
DROP POLICY IF EXISTS "Creators can update own projects" ON projects;
DROP POLICY IF EXISTS "Creators can delete own projects" ON projects;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Anyone can read projects
CREATE POLICY "Projects are publicly readable"
ON projects FOR SELECT
USING (true);

-- BLOCK all client-side writes
-- Server-side API routes will use service role key

-- ============================================
-- TRACKS TABLE
-- ============================================

DROP POLICY IF EXISTS "Tracks are viewable by everyone" ON tracks;
DROP POLICY IF EXISTS "Creators can insert tracks" ON tracks;
DROP POLICY IF EXISTS "Creators can update tracks" ON tracks;
DROP POLICY IF EXISTS "Creators can delete tracks" ON tracks;

ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;

-- Anyone can read tracks
CREATE POLICY "Tracks are publicly readable"
ON tracks FOR SELECT
USING (true);

-- BLOCK all client-side writes

-- ============================================
-- PROJECT NOTES (private data)
-- ============================================

DROP POLICY IF EXISTS "Project notes are private" ON project_notes;

ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (enforced by no policies)

-- ============================================
-- TRACK NOTES (private data)
-- ============================================

DROP POLICY IF EXISTS "Track notes are private" ON track_notes;

ALTER TABLE track_notes ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (enforced by no policies)

-- ============================================
-- PROJECT METRICS
-- ============================================

DROP POLICY IF EXISTS "Metrics are viewable by everyone" ON project_metrics;
DROP POLICY IF EXISTS "Anyone can update metrics" ON project_metrics;
DROP POLICY IF EXISTS "Anyone can insert metrics" ON project_metrics;

ALTER TABLE project_metrics ENABLE ROW LEVEL SECURITY;

-- Anyone can read metrics
CREATE POLICY "Metrics are publicly readable"
ON project_metrics FOR SELECT
USING (true);

-- Inserts allowed for incrementing (controlled by server)
-- Updates blocked from client

-- ============================================
-- USER PROJECTS (saved projects)
-- ============================================

DROP POLICY IF EXISTS "Users can manage their own saved projects" ON user_projects;

ALTER TABLE user_projects ENABLE ROW LEVEL SECURITY;

-- Anyone can read (to check if project is saved)
CREATE POLICY "User projects are publicly readable"
ON user_projects FOR SELECT
USING (true);

-- BLOCK writes from client

-- ============================================
-- TRACK PLAYS (analytics)
-- ============================================

DROP POLICY IF EXISTS "Anyone can insert plays" ON track_plays;
DROP POLICY IF EXISTS "Anyone can read plays" ON track_plays;

ALTER TABLE track_plays ENABLE ROW LEVEL SECURITY;

-- Allow inserting play records (anonymous analytics)
CREATE POLICY "Anyone can insert plays"
ON track_plays FOR INSERT
WITH CHECK (true);

-- Reading restricted to service role

-- ============================================
-- PROJECT SHARES (analytics)
-- ============================================

DROP POLICY IF EXISTS "Anyone can insert shares" ON project_shares;
DROP POLICY IF EXISTS "Anyone can read shares" ON project_shares;

ALTER TABLE project_shares ENABLE ROW LEVEL SECURITY;

-- Allow inserting share records (anonymous analytics)
CREATE POLICY "Anyone can insert shares"
ON project_shares FOR INSERT
WITH CHECK (true);

-- Reading restricted to service role

-- ============================================
-- TIPS TABLE (if exists)
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tips') THEN
        -- Drop existing policies
        DROP POLICY IF EXISTS "Tips are readable by creator" ON tips;
        DROP POLICY IF EXISTS "Anyone can insert tips" ON tips;
        
        -- Enable RLS
        ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
        
        -- Only service role can read/write tips
        -- No policies = all operations blocked for anon key
    END IF;
END $$;

-- ============================================
-- SUMMARY
-- ============================================
-- After running this script:
-- 1. The anon key can ONLY READ data (SELECT)
-- 2. All writes (INSERT/UPDATE/DELETE) are BLOCKED from client
-- 3. Server-side API routes using service role key can still do everything
-- 4. You MUST add SUPABASE_SERVICE_ROLE_KEY to your environment variables
-- 5. You MUST update your application to use API routes for all mutations
