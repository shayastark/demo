-- Fix RLS policies for users table when using Privy auth
-- Run this in your Supabase SQL editor

-- Since we're using Privy for auth (not Supabase auth), we need permissive policies
-- Option 1: Disable RLS entirely (simpler, but less secure)
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Option 2: Create permissive policies (recommended)
-- First, drop any existing restrictive policies
DROP POLICY IF EXISTS "Users can view all profiles" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for all users" ON users;
DROP POLICY IF EXISTS "Enable update for all users" ON users;

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read user profiles
CREATE POLICY "Enable read access for all users"
ON users FOR SELECT
USING (true);

-- Allow anyone to insert (for new user creation)
CREATE POLICY "Enable insert for all users"
ON users FOR INSERT
WITH CHECK (true);

-- Allow anyone to update (Privy handles auth, app validates ownership)
CREATE POLICY "Enable update for all users"
ON users FOR UPDATE
USING (true)
WITH CHECK (true);

