INSERT INTO locations (id, name, x, y, exits)
VALUES
(
  'bellweather-square',
  'Bellweather Square',
  0,
  0,
  '{"way-1":"bakery","way-3":"registry-steps","way-5":"market-lane"}'::jsonb
),
(
  'bakery',
  'The Bakery',
  -2,
  -1,
  '{"way-4":"bellweather-square"}'::jsonb
),
(
  'registry-steps',
  'Registry Steps',
  2,
  -1,
  '{"way-1":"bellweather-square"}'::jsonb
),
(
  'market-lane',
  'Market Lane',
  0,
  2,
  '{"way-2":"bellweather-square","way-4":"old-bridge"}'::jsonb
),
(
  'old-bridge',
  'The Old Bridge',
  2,
  3,
  '{"way-3":"market-lane"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  x = EXCLUDED.x,
  y = EXCLUDED.y,
  exits = EXCLUDED.exits;
