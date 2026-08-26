-- Designed anomalies
INSERT INTO anomalies
  (id, name, domain, door_key, pattern)
VALUES
  (
    'ownership-after-open',
    'Deferred Possession',
    'OWNERSHIP',
    'registry',
    '["ITEM_TAKEN","DOOR_OPENED"]'::jsonb
  ),
  (
    'bridge-return',
    NULL,
    'SPACE',
    NULL,
    '["PLAYER_MOVED","PLAYER_MOVED"]'::jsonb
  ),
  (
    'bread-ledger',
    NULL,
    'KNOWLEDGE',
    NULL,
    '["ITEM_TAKEN","PLAYER_LOOKED"]'::jsonb
  ),
  (
    'wet-key',
    NULL,
    'MATTER',
    NULL,
    '["ITEM_TAKEN","SERVER_EVENT_TRIGGERED"]'::jsonb
  ),
  (
    'courier-gap',
    NULL,
    'CAUSALITY',
    NULL,
    '["ITEM_DROPPED","PLAYER_MOVED"]'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  door_key = EXCLUDED.door_key,
  pattern = EXCLUDED.pattern;


-- World doors
INSERT INTO world_doors
  (key, name, open)
VALUES
  (
    'registry',
    'Registry Office',
    false
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name;


-- Persistent world projects
INSERT INTO projects
  (id, name, requirements)
VALUES
  (
    'repair-bridge',
    'Repair the Old Bridge',
    '{"wood":10,"metal":5,"labour":20}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  requirements = EXCLUDED.requirements;
