ALTER TABLE entities ADD COLUMN IF NOT EXISTS map_id text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS template_id text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS replenishes boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS entities_map_location_idx ON entities(map_id, location_id);
CREATE INDEX IF NOT EXISTS entities_owner_idx ON entities(owner_id);
