# UNINTENDED Hyperdrive setup

Stage 2 connects the hosted Cloudflare Worker to PostgreSQL without replacing the local Docker/Postgres runtime.

## Target architecture

- Local runtime: existing `DATABASE_URL` and local PostgreSQL remain unchanged.
- Cloud runtime: Cloudflare Worker uses a `HYPERDRIVE` binding.
- Hyperdrive origin: a publicly reachable PostgreSQL service, with Neon preferred for the hosted environment.
- Durable Objects remain responsible for live session/region coordination. PostgreSQL becomes the durable relational game state.

## 1. Create the hosted PostgreSQL database

Create a Neon PostgreSQL database and copy its connection string. Use a dedicated database/user for UNINTENDED production testing.

Do not commit the database connection string to GitHub.

## 2. Create the Hyperdrive configuration

From `apps/server-worker` while authenticated with Wrangler:

```bash
pnpm exec wrangler hyperdrive create unintended-postgres --connection-string="postgres://USER:PASSWORD@HOST:5432/DATABASE"
```

Wrangler returns a Hyperdrive configuration ID.

## 3. Add the binding to Wrangler

Add the returned ID to each environment that should use the hosted database:

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "<HYPERDRIVE_CONFIG_ID>"
  }
]
```

The binding name is intentionally fixed as `HYPERDRIVE`.

## 4. Hosted database validation

The Worker package includes `src/db.ts`, which uses `pg` through the Hyperdrive-provided connection string. The first production integration should expose a narrow database health route and then move only player location reads/writes behind PostgreSQL.

## 5. Migration order

1. Validate Hyperdrive connectivity with `select now(), current_database()`.
2. Apply the existing PostgreSQL schema/migrations to the hosted database.
3. Introduce a hosted player identity mapping suitable for the existing UUID-backed `characters` table.
4. Move `LOOK` player-state reads from Durable Object storage to PostgreSQL.
5. Move `MOVE` player-state writes to PostgreSQL.
6. Keep Region Durable Objects/WebSockets as the live delivery layer.
7. Migrate inventory, discoveries, relationships, anomaly claims, ownership and event history incrementally.

## Existing schema note

The current server schema already has durable relational structures for `characters`, `locations`, `entities`, anomalies, progression and world events. We should reuse that schema rather than inventing a second cloud-only game database.
