DO $$
DECLARE
  rec RECORD;
  cnt INT := 0;
BEGIN
  FOR rec IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'timestamp with time zone'
    ORDER BY table_name, column_name
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE timestamp without time zone USING %I AT TIME ZONE ''UTC''',
      rec.table_name, rec.column_name, rec.column_name
    );
    cnt := cnt + 1;
  END LOOP;

  RAISE NOTICE 'Converted % TIMESTAMPTZ columns to TIMESTAMP', cnt;
END $$;
