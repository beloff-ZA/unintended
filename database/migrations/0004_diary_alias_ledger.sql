CREATE TABLE IF NOT EXISTS anomaly_alias_ledger (
  alias text PRIMARY KEY,
  template_id text NOT NULL,
  unique_attempts integer NOT NULL DEFAULT 0,
  discoveries integer NOT NULL DEFAULT 0,
  last_outcome text NOT NULL DEFAULT 'NO EFFECT',
  last_reward text,
  last_action text,
  last_player_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anomaly_alias_attempts_idx
  ON anomaly_alias_ledger(unique_attempts, updated_at);

CREATE TABLE IF NOT EXISTS anomaly_alias_attempts (
  alias text NOT NULL REFERENCES anomaly_alias_ledger(alias) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  first_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(alias, player_id)
);
