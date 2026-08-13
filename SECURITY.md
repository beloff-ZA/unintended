# Security boundary
UNINTENDED encourages curiosity but does not expose real infrastructure weaknesses.

Never expose production secrets, raw database credentials, internal admin endpoints, eval/shell/filesystem access, arbitrary SQL, or other users' authentication material. Designed pseudo-server endpoints must be explicit allow-listed gameplay APIs with validation and rate limits.

Treat every browser command and WebSocket payload as hostile input. The server remains authoritative for inventory, ownership, anomaly claims and world state.
