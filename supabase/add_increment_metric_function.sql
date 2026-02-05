-- Atomic metric increment function
-- Prevents race conditions by doing the increment in a single database operation
-- Also handles the case where no metrics row exists yet (upsert)

CREATE OR REPLACE FUNCTION increment_metric(p_project_id uuid, p_field text)
RETURNS void AS $$
BEGIN
  -- Validate the field name to prevent SQL injection
  IF p_field NOT IN ('plays', 'shares', 'adds') THEN
    RAISE EXCEPTION 'Invalid metric field: %', p_field;
  END IF;

  -- Insert a row if one doesn't exist yet
  INSERT INTO project_metrics (project_id, plays, shares, adds)
  VALUES (p_project_id, 0, 0, 0)
  ON CONFLICT (project_id) DO NOTHING;

  -- Atomically increment the specified field
  EXECUTE format(
    'UPDATE project_metrics SET %I = %I + 1 WHERE project_id = $1',
    p_field, p_field
  ) USING p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to both anon and authenticated roles so the RPC is callable
GRANT EXECUTE ON FUNCTION increment_metric(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION increment_metric(uuid, text) TO authenticated;
