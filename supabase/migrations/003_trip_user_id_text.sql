ALTER TABLE trips
  ALTER COLUMN user_id TYPE TEXT USING user_id::text;
