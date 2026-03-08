-- Add more social link fields for creator profiles.
-- Safe to run multiple times.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS spotify_url TEXT,
  ADD COLUMN IF NOT EXISTS discord_url TEXT,
  ADD COLUMN IF NOT EXISTS other_link_url TEXT;
