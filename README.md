# UNINTENDED

Text-first persistent multiplayer world MVP. The core experiment is whether discovering rules, sharing knowledge, and finding unique rule contradictions is fun in a tiny persistent world.

## Stack
React + TypeScript + Vite; Node.js + TypeScript + Fastify; WebSocket (`ws`); PostgreSQL + Drizzle; Redis; Vitest; Playwright; Docker Compose; Caddy.

## Architecture laws
- Modular monolith, not microservices.
- PostgreSQL is durable authority; Redis is ephemeral presence/cache/rate-limit state.
- Browser input is hostile and never decides anomaly ownership.
- No complete command/anomaly list is sent to clients.
- Meaningful actions produce events.
- No global high-frequency game tick.
- Anomalies are designed contradictions, not executable dynamic code.

## Local development
1. Copy `.env.example` to `.env`.
2. Start PostgreSQL + Redis: `docker compose up -d postgres redis`.
3. `pnpm install`
4. `pnpm db:migrate`
5. `pnpm world:seed`
6. `pnpm dev`
7. Open `http://localhost:5173`.

`DEV_AUTH=true` exposes self-test player identities only in development.

## MVP world
Bellweather currently provides five locations, five NPCs, twenty objects, ten concepts, five designed anomaly definitions, one global Door, one profession/production chain, one world project, weather, HELP, and sparse Server announcements.
