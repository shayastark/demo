-- Add profile customization fields for banner, tags, availability, and pinned project.
-- Safe to run multiple times.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS banner_image_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_tags TEXT[],
  ADD COLUMN IF NOT EXISTS availability_status TEXT,
  ADD COLUMN IF NOT EXISTS pinned_project_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_pinned_project_id_fkey'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_pinned_project_id_fkey
      FOREIGN KEY (pinned_project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_availability_status_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_availability_status_check;
  END IF;

  ALTER TABLE users
    ADD CONSTRAINT users_availability_status_check
    CHECK (
      availability_status IS NULL OR availability_status IN (
        'open_to_collabs',
        'available_for_hire',
        'heads_down',
        'just_browsing'
      )
    );
END $$;
