-- Add listener fingerprint support for qualified play cooldowns.
-- Safe to run multiple times.

ALTER TABLE track_plays
  ADD COLUMN IF NOT EXISTS listener_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_track_plays_track_user_played_at
  ON track_plays(track_id, user_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_track_plays_track_listener_fingerprint_played_at
  ON track_plays(track_id, listener_fingerprint, played_at DESC);
