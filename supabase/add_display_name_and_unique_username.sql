-- Add display_name support and enforce unique usernames (case-insensitive).
-- Safe to run multiple times.
-- Rollback notes:
--   1) DROP INDEX IF EXISTS users_username_lower_unique;
--   2) ALTER TABLE users DROP COLUMN IF EXISTS display_name;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Optional backfill so existing users have a friendly default.
UPDATE users
SET display_name = username
WHERE display_name IS NULL
  AND username IS NOT NULL;

-- Enforce unique usernames regardless of letter case.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
  ON users (lower(username))
  WHERE username IS NOT NULL;
