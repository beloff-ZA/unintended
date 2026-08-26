-- NPCs
INSERT INTO npc_state (id, name, location_id, job, memory, data)
VALUES
  ('npc-baker',   'Baker',          'bakery',             'baker',   '[]'::jsonb, '{}'::jsonb),
  ('npc-farmer',  'Farmer',         'market-lane',         'farmer',  '[]'::jsonb, '{}'::jsonb),
  ('npc-courier', 'Courier',        'bellweather-square',  'courier', '[]'::jsonb, '{}'::jsonb),
  ('npc-clerk',   'Clerk',          'registry-steps',      'clerk',   '[]'::jsonb, '{}'::jsonb),
  ('npc-stranger','Strange Person', 'old-bridge',          'unknown', '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  location_id = EXCLUDED.location_id,
  job = EXCLUDED.job;

-- Items
INSERT INTO entities
  (id, name, kind, location_id, owner_id, portable, openable, open, data)
VALUES
  ('item-1',  'brass key',      'item', 'bellweather-square', NULL, true,  false, false, '{}'::jsonb),
  ('item-2',  'apple',          'item', 'market-lane',        NULL, true,  false, false, '{}'::jsonb),
  ('item-3',  'loaf of bread',  'item', 'bakery',             NULL, true,  false, false, '{}'::jsonb),
  ('item-4',  'grain sack',     'item', 'market-lane',        NULL, true,  false, false, '{}'::jsonb),
  ('item-5',  'ledger',         'item', 'registry-steps',     NULL, true,  false, false, '{}'::jsonb),
  ('item-6',  'wooden box',     'item', 'bakery',             NULL, true,  true,  false, '{}'::jsonb),
  ('item-7',  'iron nail',      'item', 'old-bridge',         NULL, true,  false, false, '{}'::jsonb),
  ('item-8',  'raincoat',       'item', 'bellweather-square', NULL, true,  false, false, '{}'::jsonb),
  ('item-9',  'coin',           'item', 'market-lane',        NULL, true,  false, false, '{}'::jsonb),
  ('item-10', 'letter',         'item', 'registry-steps',     NULL, true,  false, false, '{}'::jsonb),
  ('item-11', 'spade',          'item', 'market-lane',        NULL, true,  false, false, '{}'::jsonb),
  ('item-12', 'rope',           'item', 'old-bridge',         NULL, true,  false, false, '{}'::jsonb),
  ('item-13', 'empty bottle',   'item', 'bakery',             NULL, true,  false, false, '{}'::jsonb),
  ('item-14', 'train token',    'item', 'bellweather-square', NULL, true,  false, false, '{}'::jsonb),
  ('item-15', 'old map',        'item', 'old-bridge',         NULL, true,  false, false, '{}'::jsonb),
  ('item-16', 'wet stone',      'item', 'old-bridge',         NULL, true,  false, false, '{}'::jsonb),
  ('item-17', 'receipt',        'item', 'bakery',             NULL, true,  false, false, '{}'::jsonb),
  ('item-18', 'hammer',         'item', 'market-lane',        NULL, true,  false, false, '{}'::jsonb),
  ('item-19', 'sign',           'item', 'registry-steps',     NULL, false, false, false, '{}'::jsonb),
  ('item-20', 'candle',         'item', 'bakery',             NULL, true,  false, false, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  location_id = EXCLUDED.location_id,
  portable = EXCLUDED.portable,
  openable = EXCLUDED.openable;
