CREATE TABLE IF NOT EXISTS hosted_player_identities (
  browser_player_id text PRIMARY KEY,
  character_id uuid NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hosted_player_identities_character_idx
  ON hosted_player_identities(character_id);
