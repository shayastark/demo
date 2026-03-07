-- Upload quotas and usage tracking
-- Safe to run multiple times

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tracks_size_bytes_check'
      AND conrelid = 'public.tracks'::regclass
  ) THEN
    ALTER TABLE public.tracks
      ADD CONSTRAINT tracks_size_bytes_check
      CHECK (size_bytes IS NULL OR size_bytes >= 0);
  END IF;
END $$;

UPDATE public.tracks AS tracks
SET size_bytes = (objects.metadata->>'size')::bigint
FROM storage.objects AS objects
WHERE tracks.size_bytes IS NULL
  AND objects.bucket_id = 'hubba-files'
  AND objects.name = replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  regexp_replace(
                    split_part(tracks.audio_url, '?', 1),
                    '^https?://[^/]+/storage/v1/object/(public|sign)/hubba-files/',
                    ''
                  ),
                  '%20',
                  ' '
                ),
                '%27',
                ''''
              ),
              '%28',
              '('
            ),
            '%29',
            ')'
          ),
          '%2C',
          ','
        ),
        '%3B',
        ';'
      ),
      '%26',
      '&'
    ),
    '%23',
    '#'
  );

CREATE TABLE IF NOT EXISTS public.upload_quota_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('audio', 'attachment')),
  attachment_type TEXT CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'file', 'link')),
  byte_size BIGINT NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  success BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_quota_events_user_created_at_desc
  ON public.upload_quota_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_quota_events_project_created_at_desc
  ON public.upload_quota_events(project_id, created_at DESC);

ALTER TABLE public.upload_quota_events ENABLE ROW LEVEL SECURITY;
