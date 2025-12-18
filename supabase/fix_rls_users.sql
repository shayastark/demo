-- Fix RLS policies for users table
-- Since we're using Privy (not Supabase Auth), we need to allow inserts

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can insert" ON users;

-- Allow anyone to insert users (security enforced by application logic)
CREATE POLICY "Users can insert" ON users
  FOR INSERT WITH CHECK (true);

-- Update the SELECT policy to allow all reads (since we're not using Supabase Auth)
DROP POLICY IF EXISTS "Users can view own data" ON users;
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (true);

-- Update the UPDATE policy (since we're not using Supabase Auth)
DROP POLICY IF EXISTS "Users can update own data" ON users;
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (true); -- Will be enforced by application logic

