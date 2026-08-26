ALTER TABLE world_events
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS world_events_request_id_unique
  ON world_events(request_id)
  WHERE request_id IS NOT NULL;
