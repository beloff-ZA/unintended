# UNINTENDED dual-runtime development

UNINTENDED keeps one authoritative game model while supporting two transport/runtime adapters.

## Runtime A: local Node

The existing local development stack remains authoritative during the migration:

- `apps/web` — browser client
- `apps/server` — Fastify + `ws`
- PostgreSQL — durable state
- Redis — sessions, presence and rate limits
- Docker Compose — local integration environment

Existing local commands continue to work. The root `dev` command intentionally does **not** start the Cloudflare Worker.

```bash
pnpm dev
```

or continue using Docker Compose as before.

## Runtime B: Cloudflare Worker

`apps/server-worker` is the Cloudflare adapter. It is introduced beside the Node server rather than replacing it.

Start the Worker runtime locally using Cloudflare's local runtime:

```bash
pnpm dev:cloudflare
```

The initial foundation exposes:

```text
GET /health
```

The `/ws` route intentionally returns `501` until the multiplayer transport is moved behind runtime-neutral interfaces and Durable Objects are introduced.

Build the Cloudflare adapter without deploying:

```bash
pnpm build:cloudflare
```

The repository-wide `pnpm build`, `pnpm typecheck`, and `pnpm test` also include `apps/server-worker`, so GitHub CI validates both runtime targets.

## Architectural rule

Gameplay code must not depend directly on Fastify, `ws`, Cloudflare Workers, Durable Objects, Redis, HTTP requests, or browser APIs.

The dependency direction is:

```text
Browser / transport adapter
          |
          v
      game-core
          |
          v
 repository/runtime interfaces
          |
     +----+----+
     |         |
     v         v
 Node impl   Cloudflare impl
```

`packages/game-core` already receives a `GameRepository` interface. Preserve that boundary and extend it rather than moving database or transport code back into the engine.

## Migration order

1. Keep the existing Node/Docker version working.
2. Formalise request IDs and shared client/server protocol messages.
3. Move transport-independent command orchestration out of `apps/server/src/websocket/socket.ts`.
4. Separate presence, rate limiting and broadcasts behind runtime interfaces.
5. Remove permanent authority from process-local maps.
6. Add reconnect/state snapshot behaviour.
7. Add Cloudflare Durable Object WebSocket coordination.
8. Add Neon PostgreSQL and Hyperdrive as the hosted database adapter.
9. Run the same game-core and integration behaviour tests against local and hosted adapters.
10. Only then point the public game subdomain at the Cloudflare runtime.

## Environments

The Worker configuration defines three logical environments:

- local — `wrangler dev`
- preview — hosted integration testing
- production — eventual public deployment

Do not put secrets in `wrangler.jsonc`, `.env.example`, frontend Vite variables or Git.

## Current boundary

At this stage the Worker is deliberately non-authoritative. No player inventory, ownership, anomaly discovery, world mutation or session state is processed by the Worker yet. This keeps the migration reversible while CI proves that the second runtime remains buildable.

Preview deployments are intentionally used to validate the Cloudflare runtime before production promotion.

Build-trigger checkpoint: fresh Git commit after Cloudflare build settings were updated.
