-- Add 'format' column to tracks table
-- This extracts the file extension from the audio_url

-- Option A: Generated column (automatically computed from audio_url)
-- This is always in sync and doesn't need manual updates

ALTER TABLE tracks 
ADD COLUMN IF NOT EXISTS format TEXT 
GENERATED ALWAYS AS (
  LOWER(
    CASE 
      -- Extract extension from URL, handling query strings
      WHEN audio_url LIKE '%.mp3%' THEN 'mp3'
      WHEN audio_url LIKE '%.wav%' THEN 'wav'
      WHEN audio_url LIKE '%.m4a%' THEN 'm4a'
      WHEN audio_url LIKE '%.aac%' THEN 'aac'
      WHEN audio_url LIKE '%.flac%' THEN 'flac'
      WHEN audio_url LIKE '%.ogg%' THEN 'ogg'
      WHEN audio_url LIKE '%.webm%' THEN 'webm'
      WHEN audio_url LIKE '%.opus%' THEN 'opus'
      -- Fallback: try to extract extension before any query string
      ELSE COALESCE(
        NULLIF(
          REGEXP_REPLACE(
            REGEXP_REPLACE(audio_url, '\?.*$', ''), -- Remove query string
            '^.*\.([a-zA-Z0-9]+)$', '\1'  -- Extract extension
          ),
          audio_url
        ),
        'unknown'
      )
    END
  )
) STORED;

-- Note: Generated columns are read-only and automatically computed
-- They update whenever the audio_url changes
