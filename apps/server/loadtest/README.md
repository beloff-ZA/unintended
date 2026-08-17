# UNINTENDED load harness

This directory is deliberately outside `src/` and is not imported by the production server. It exists only for synthetic load testing.

## Requirements

- Target server must have `DEV_AUTH=true` while the test is running.
- The world must be migrated and seeded before testing.
- Disable `DEV_AUTH` again for any public/alpha deployment.

## Run 100 bots

From repository root:

```bash
BASE_URL=http://127.0.0.1:3080 pnpm loadtest:100
```

Useful overrides:

```bash
BASE_URL=https://test.example.com \
BOT_COUNT=250 \
COMMAND_DELAY_MS=150 \
BOT_TIMEOUT_MS=120000 \
LOADTEST_AI_VARIANTS=false \
pnpm loadtest:100
```

The harness writes `loadtest-report-<BOT_COUNT>.json` with login, WebSocket, command and state latency percentiles; errors; Bellweather completion; grade distribution; command totals; and Origin Map distribution.

`LOADTEST_AI_VARIANTS=true` makes every fifth bot use intentionally loose natural-language phrasing. Leave it off for infrastructure-only tests to avoid unnecessary AI cost and variability.

## Alpha removal / disablement

No production source imports this directory. For alpha you only need to set:

```env
DEV_AUTH=false
```

If the harness should be removed from the repository entirely, delete `apps/server/loadtest/` and remove the `loadtest:100` script from the root `package.json`. No game code, database schema, runtime route, Docker service or gameplay configuration depends on the harness.
