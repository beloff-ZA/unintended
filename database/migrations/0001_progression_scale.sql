CREATE TABLE IF NOT EXISTS player_progress (
  player_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  understanding jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  hint_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_title text NOT NULL DEFAULT 'Mostly Present',
  hidden_tier integer NOT NULL DEFAULT 0,
  current_region text NOT NULL DEFAULT 'bellweather',
  region_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anomaly_claims_v2 (
  instance_id text PRIMARY KEY,
  template_id text NOT NULL,
  variant integer NOT NULL,
  world_seed text NOT NULL,
  player_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  exception jsonb NOT NULL,
  utility text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS anomaly_claims_v2_player_idx ON anomaly_claims_v2(player_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS anomaly_claims_v2_template_idx ON anomaly_claims_v2(template_id);

CREATE TABLE IF NOT EXISTS region_progress (
  player_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  region_id text NOT NULL,
  grade text NOT NULL DEFAULT 'FAIL',
  completed_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(player_id, region_id)
);
CREATE INDEX IF NOT EXISTS region_progress_region_idx ON region_progress(region_id, grade);

CREATE TABLE IF NOT EXISTS ai_interactions (
  id bigserial PRIMARY KEY,
  player_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  input_hash text NOT NULL,
  kind text NOT NULL,
  model text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_interactions_player_idx ON ai_interactions(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_interactions_created_idx ON ai_interactions(created_at DESC);
