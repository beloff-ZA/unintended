# MVP Architecture

## Durable authority
PostgreSQL stores users, characters, concepts, entities, ownership, NPC state, anomalies, anomaly owners, Doors, events, projects and history. Atomic database transactions decide first anomaly ownership.

## Ephemeral coordination
Redis stores sessions, presence, rate limits and short-lived coordination. Redis is not world truth.

## Runtime
Fastify hosts HTTP APIs and the WebSocket upgrade endpoint in one Node.js/TypeScript server. Game modules are internal modules, not microservices.

## Event-driven world
Commands become validated intents. Rules mutate authoritative state and produce meaningful events. Anomaly definitions match designed event/state conditions. Scheduled jobs will advance NPC/economy state at meaningful boundaries; no world-wide high-frequency tick is permitted.

## Client
React/Vite is a thin terminal UI. It knows only a player's learned concepts and observable state. It does not receive master vocabulary, anomaly definitions, secrets or authoritative rule logic.
