-- Enforce supported notification types with backward-compatible fallback.
-- Safe to run multiple times.

-- Normalize legacy/unknown values before adding constraint.
UPDATE notifications
SET type = 'unknown'
WHERE type IS NULL
   OR type NOT IN (
     'tip_received',
     'project_saved',
     'new_follower',
     'project_shared',
     'new_track',
     'unknown'
   );

-- Ensure a sane default for any direct inserts.
ALTER TABLE notifications
  ALTER COLUMN type SET DEFAULT 'unknown';

DO $$
BEGIN
  -- Drop old check if it exists (name from previous migrations or manual changes).
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_type_check'
      AND conrelid = 'notifications'::regclass
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  END IF;

  -- Add canonical type check exactly once.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_type_check'
      AND conrelid = 'notifications'::regclass
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (
        type IN (
          'tip_received',
          'project_saved',
          'new_follower',
          'project_shared',
          'new_track',
          'unknown'
        )
      );
  END IF;
END $$;
