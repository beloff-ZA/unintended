CREATE TABLE IF NOT EXISTS world_directions (
  key text PRIMARY KEY,
  shape text NOT NULL,
  label text NOT NULL
);

INSERT INTO world_directions (key, shape, label)
VALUES
  ('way-1', '■', 'Way Out'),
  ('way-2', '⬟', 'Your Way'),
  ('way-3', '✦', 'Broadway'),
  ('way-4', '✕', 'Wrong Way'),
  ('way-5', '▲', 'The Long Way')
ON CONFLICT (key) DO UPDATE SET
  shape = EXCLUDED.shape,
  label = EXCLUDED.label;
