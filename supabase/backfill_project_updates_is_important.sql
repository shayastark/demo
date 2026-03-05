-- Important Update Fallback Cleanup MVP
-- Safe/idempotent backfill for high-confidence historical important updates.
-- Patterns intentionally conservative:
--   - version_label exactly "final" or "release"
--   - version_label starts with "final " or "release "
--   - version_label contains "official release"
-- Exclusions:
--   - candidate/rc/beta/alpha/draft/wip/preview
-- Rollback notes:
--   1) UPDATE project_updates
--        SET is_important = false
--      WHERE is_important = true
--        AND version_label IS NOT NULL
--        AND (
--          lower(trim(version_label)) = 'final'
--          OR lower(trim(version_label)) = 'release'
--          OR lower(trim(version_label)) LIKE 'final %'
--          OR lower(trim(version_label)) LIKE 'release %'
--          OR lower(trim(version_label)) LIKE '%official release%'
--        );

DO $$
DECLARE
  affected_count INTEGER := 0;
BEGIN
  UPDATE project_updates
  SET is_important = true
  WHERE is_important = false
    AND version_label IS NOT NULL
    AND (
      lower(trim(version_label)) = 'final'
      OR lower(trim(version_label)) = 'release'
      OR lower(trim(version_label)) LIKE 'final %'
      OR lower(trim(version_label)) LIKE 'release %'
      OR lower(trim(version_label)) LIKE '%official release%'
    )
    AND lower(trim(version_label)) !~ '(candidate|rc|beta|alpha|draft|wip|preview)';

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'project_update_importance_compat_event %', json_build_object(
    'schema', 'project_update_importance_compat.v1',
    'action', 'backfill_marked',
    'source', 'db_migration',
    'grouped_count', affected_count
  )::text;
END $$;
