ALTER TABLE npc_state ADD COLUMN IF NOT EXISTS map_id text;
ALTER TABLE npc_state ADD COLUMN IF NOT EXISTS template_id text;
ALTER TABLE npc_state ADD COLUMN IF NOT EXISTS global_capable boolean NOT NULL DEFAULT false;
ALTER TABLE npc_state ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS npc_state_map_location_idx ON npc_state(map_id, location_id);
CREATE INDEX IF NOT EXISTS npc_state_template_idx ON npc_state(template_id);

ALTER TABLE entities ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE entities ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS entities_retention_idx ON entities(replenishes, updated_at);
CREATE INDEX IF NOT EXISTS world_events_actor_created_idx ON world_events(actor_id, created_at);
