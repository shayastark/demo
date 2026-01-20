-- Add X (Twitter) and Farcaster social link columns to users table

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS twitter TEXT,
ADD COLUMN IF NOT EXISTS farcaster TEXT;

-- twitter: Just the username (e.g., "shayastark")
-- farcaster: Just the username (e.g., "shaya") - links to https://farcaster.xyz/{username}
