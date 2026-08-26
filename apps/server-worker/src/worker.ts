import { ClientCommand } from '@unintended/shared';
import { DEFAULT_WORLD_SEED } from '@unintended/world-data';
import baseWorker, { PlayerState, Region } from './index';
import {
  ensureHostedPlayerState,
  hostedIdentitySchemaAvailable,
  hostedWorldSchemaAvailable,
  isMissingHostedPlayerSchemaError,
  readHostedPlayerState,
  readHostedWorldDirections,
  readHostedWorldSnapshot,
  writeHostedPlayerLocation,
  type HyperdriveBinding,
} from './db';

type DurableObjectBinding = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
};

type WorkerEnv = {
  DEPLOYMENT_ENV?: string;
  HYPERDRIVE: HyperdriveBinding;
  PLAYER_STATE: DurableObjectBinding;
  REGION: DurableObjectBinding;
};

type LegacyPlayerState = {
  locationId: string;
};

const START_LOCATION = 'bellweather-square';

const legacyStub = (env: WorkerEnv, playerId: string) =>
  env.PLAYER_STATE.get(env.PLAYER_STATE.idFromName(playerId));

const regionStub = (env: WorkerEnv, locationId: string) =>
  env.REGION.get(env.REGION.idFromName(locationId));

const readLegacyState = async (env: WorkerEnv, playerId: string): Promise<LegacyPlayerState> => {
  const response = await legacyStub(env, playerId).fetch('https://player-state/state');
  if (!response.ok) throw new Error('LEGACY_PLAYER_STATE_READ_FAILED');
  return response.json() as Promise<LegacyPlayerState>;
};

const writeLegacyLocation = async (env: WorkerEnv, playerId: string, locationId: string) => {
  const response = await legacyStub(env, playerId).fetch('https://player-state/move', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locationId }),
  });
  if (!response.ok) throw new Error('LEGACY_PLAYER_STATE_WRITE_FAILED');
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const postgresPlayerStateBinding = (env: WorkerEnv): DurableObjectBinding => ({
  idFromName: (name: string) => name,
  get: (id: unknown) => {
    const playerId = String(id);
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);

        if (request.method === 'GET' && url.pathname === '/state') {
          try {
            const existing = await readHostedPlayerState(env.HYPERDRIVE, playerId);
            if (existing) {
              return json({
                locationId: existing.locationId,
                characterId: existing.characterId,
                authority: 'postgres',
              });
            }

            const legacy = await readLegacyState(env, playerId);
            const created = await ensureHostedPlayerState(
              env.HYPERDRIVE,
              playerId,
              legacy.locationId || START_LOCATION,
            );
            return json({
              locationId: created.locationId,
              characterId: created.characterId,
              authority: 'postgres',
              migratedFrom: 'durable-object',
            });
          } catch (error) {
            if (!isMissingHostedPlayerSchemaError(error)) throw error;
            const legacy = await readLegacyState(env, playerId);
            return json({
              locationId: legacy.locationId || START_LOCATION,
              authority: 'durable-object-fallback',
            });
          }
        }

        if (request.method === 'POST' && url.pathname === '/move') {
          const body = (await request.json()) as { locationId?: string };
          const locationId = body.locationId?.trim() || START_LOCATION;

          try {
            let existing = await readHostedPlayerState(env.HYPERDRIVE, playerId);
            if (!existing) {
              const legacy = await readLegacyState(env, playerId);
              existing = await ensureHostedPlayerState(
                env.HYPERDRIVE,
                playerId,
                legacy.locationId || START_LOCATION,
              );
            }

            const updated = await writeHostedPlayerLocation(env.HYPERDRIVE, playerId, locationId);
            await writeLegacyLocation(env, playerId, locationId).catch((error) =>
              console.warn('Legacy player-state shadow write failed', error),
            );
            return json({
              locationId: updated.locationId,
              characterId: updated.characterId,
              authority: 'postgres',
            });
          } catch (error) {
            if (!isMissingHostedPlayerSchemaError(error)) throw error;
            await writeLegacyLocation(env, playerId, locationId);
            return json({ locationId, authority: 'durable-object-fallback' });
          }
        }

        return legacyStub(env, playerId).fetch(request);
      },
    };
  },
});

const enrichHealth = async (request: Request, env: WorkerEnv, adaptedEnv: WorkerEnv) => {
  const base = await baseWorker.fetch(request, adaptedEnv);
  let payload: Record<string, unknown>;
  try {
    payload = (await base.json()) as Record<string, unknown>;
  } catch {
    return base;
  }

  let hostedIdentityReady = false;
  let hostedWorldReady = false;
  try {
    [hostedIdentityReady, hostedWorldReady] = await Promise.all([
      hostedIdentitySchemaAvailable(env.HYPERDRIVE),
      hostedWorldSchemaAvailable(env.HYPERDRIVE),
    ]);
  } catch (error) {
    console.error('Hosted schema probe failed', error);
  }

  return json({
    ...payload,
    hostedIdentityReady,
    hostedWorldReady,
    playerState: hostedIdentityReady ? 'postgres' : 'durable-object-fallback',
    worldState: hostedWorldReady ? 'postgres' : 'world-data-fallback',
    directionState: hostedWorldReady ? 'postgres' : 'world-data-fallback',
    playerStateFallback: 'durable-object-shadow',
  }, base.status);
};

const playerIdFor = (request: Request, url: URL) =>
  request.headers.get('x-player-id')?.trim() || url.searchParams.get('player')?.trim() || 'dev-player-1';

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const publicSnapshot = async (env: WorkerEnv, locationId: string) => {
  const stored = await readHostedWorldSnapshot(env.HYPERDRIVE, locationId);
  if (!stored) return null;

  const exitEntries = Object.entries(stored.location.exits);
  const [targets, directions] = await Promise.all([
    Promise.all(exitEntries.map(([, targetId]) => readHostedWorldSnapshot(env.HYPERDRIVE, targetId))),
    readHostedWorldDirections(env.HYPERDRIVE, exitEntries.map(([key]) => key)),
  ]);
  const names = new Map(targets.filter(Boolean).map((entry) => [entry!.location.id, entry!.location.name]));

  return {
    seed: DEFAULT_WORLD_SEED,
    location: {
      id: stored.location.id,
      name: stored.location.name,
      x: stored.location.x,
      y: stored.location.y,
    },
    exits: exitEntries.map(([key, targetId]) => {
      const direction = directions.get(key);
      return {
        key,
        label: direction?.label ?? key,
        shape: direction?.shape ?? '?',
        targetId,
        targetName: names.get(targetId) ?? targetId,
      };
    }),
    nearby: stored.nearby,
    authority: 'postgres',
    directionAuthority: 'postgres',
  };
};

const resolveExit = async (env: WorkerEnv, locationId: string, requested: string) => {
  const snapshot = await publicSnapshot(env, locationId);
  if (!snapshot) return null;
  const wanted = normalise(requested);
  const exit = snapshot.exits.find((candidate) =>
    [candidate.key, candidate.label, candidate.targetId, candidate.targetName, `${candidate.shape} ${candidate.label}`]
      .map(normalise)
      .includes(wanted),
  );
  return exit ? { snapshot, exit } : { snapshot, exit: null };
};

const lookLines = (snapshot: Awaited<ReturnType<typeof publicSnapshot>>) => {
  if (!snapshot) return ['The world database has misplaced this location.'];
  return [
    snapshot.location.name,
    snapshot.exits.length
      ? `Ways out: ${snapshot.exits.map((exit) => `${exit.shape} ${exit.label}`).join(', ')}`
      : 'There are no obvious ways out. This is either important or poor planning.',
    snapshot.nearby.npcs.length
      ? `Nearby: ${snapshot.nearby.npcs.map((npc) => npc.name).join(', ')}`
      : 'Nobody nearby appears professionally relevant.',
    snapshot.nearby.items.length
      ? `Visible: ${snapshot.nearby.items.map((item) => item.name).join(', ')}`
      : 'Nothing portable is volunteering for attention.',
  ];
};

const ensurePlayer = async (env: WorkerEnv, adaptedEnv: WorkerEnv, playerId: string) => {
  const response = await adaptedEnv.PLAYER_STATE
    .get(adaptedEnv.PLAYER_STATE.idFromName(playerId))
    .fetch('https://player-state/state');
  if (!response.ok) throw new Error('PLAYER_STATE_READ_FAILED');
  return response.json() as Promise<{ locationId: string; characterId?: string }>;
};

const writePlayerLocation = async (adaptedEnv: WorkerEnv, playerId: string, locationId: string) => {
  const response = await adaptedEnv.PLAYER_STATE
    .get(adaptedEnv.PLAYER_STATE.idFromName(playerId))
    .fetch('https://player-state/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locationId }),
    });
  if (!response.ok) throw new Error('PLAYER_STATE_WRITE_FAILED');
};

export { PlayerState, Region };

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const adaptedEnv: WorkerEnv = {
      ...env,
      PLAYER_STATE: postgresPlayerStateBinding(env),
    };

    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/db/health')) {
      return enrichHealth(request, env, adaptedEnv);
    }

    if (request.method === 'GET' && url.pathname === '/world') {
      try {
        const playerId = playerIdFor(request, url);
        const player = await ensurePlayer(env, adaptedEnv, playerId);
        const snapshot = await publicSnapshot(env, player.locationId);
        if (!snapshot) return json({ ok: false, code: 'WORLD_LOCATION_NOT_FOUND' }, 500);
        return json({ ok: true, playerId, authoritativePlayerLocation: true, ...snapshot });
      } catch (error) {
        console.error('Postgres world read failed', error);
        return baseWorker.fetch(request, adaptedEnv);
      }
    }

    if (url.pathname === '/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      try {
        const playerId = playerIdFor(request, url);
        const player = await ensurePlayer(env, adaptedEnv, playerId);
        const internal = new URL('https://region/connect');
        internal.searchParams.set('player', playerId);
        internal.searchParams.set('location', player.locationId);
        return regionStub(env, player.locationId).fetch(new Request(internal, request));
      } catch (error) {
        console.error('Postgres websocket region lookup failed', error);
        return baseWorker.fetch(request, adaptedEnv);
      }
    }

    if (request.method === 'POST' && url.pathname === '/command') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, code: 'INVALID_JSON', message: 'The Server expected JSON and received interpretive dance.' }, 400);
      }

      const parsed = ClientCommand.safeParse(body);
      if (!parsed.success) {
        return json({ ok: false, code: 'INVALID_COMMAND', message: 'The Server declines to understand that packet.' }, 400);
      }

      const playerId = playerIdFor(request, url);
      const requestId = parsed.data.requestId;
      const command = parsed.data.text.trim();

      try {
        const player = await ensurePlayer(env, adaptedEnv, playerId);

        if (/^(?:look|look around|where am i)$/i.test(command)) {
          const snapshot = await publicSnapshot(env, player.locationId);
          if (!snapshot) return json({ ok: false, code: 'WORLD_LOCATION_NOT_FOUND' }, 500);
          return json({ ok: true, playerId, requestId, command, lines: lookLines(snapshot), state: snapshot });
        }

        const movement = command.match(/^(?:go|move|walk|travel)(?:\s+(?:to|via))?\s+(.+)$/i);
        if (movement) {
          const resolved = await resolveExit(env, player.locationId, movement[1]!);
          if (!resolved) return json({ ok: false, code: 'WORLD_LOCATION_NOT_FOUND' }, 500);
          if (!resolved.exit) {
            return json({
              ok: false,
              playerId,
              requestId,
              code: 'NO_SUCH_EXIT',
              lines: [
                `You cannot get there from ${resolved.snapshot.location.name} by that description.`,
                resolved.snapshot.exits.length
                  ? `Available: ${resolved.snapshot.exits.map((candidate) => `${candidate.shape} ${candidate.label}`).join(', ')}`
                  : 'There are, inconveniently, no available exits.',
              ],
              state: resolved.snapshot,
            }, 400);
          }

          await writePlayerLocation(adaptedEnv, playerId, resolved.exit.targetId);
          const snapshot = await publicSnapshot(env, resolved.exit.targetId);
          if (!snapshot) return json({ ok: false, code: 'WORLD_LOCATION_NOT_FOUND' }, 500);
          return json({
            ok: true,
            playerId,
            requestId,
            command,
            moved: true,
            lines: [`You take ${resolved.exit.shape} ${resolved.exit.label}.`, ...lookLines(snapshot)],
            state: snapshot,
          });
        }

        if (/^(?:reset|reset location|return to start)$/i.test(command)) {
          await writePlayerLocation(adaptedEnv, playerId, START_LOCATION);
          const snapshot = await publicSnapshot(env, START_LOCATION);
          if (!snapshot) return json({ ok: false, code: 'WORLD_LOCATION_NOT_FOUND' }, 500);
          return json({
            ok: true,
            playerId,
            requestId,
            command,
            reset: true,
            lines: ['The Server returns you to Bellweather Square with all the ceremony of correcting a spreadsheet.', ...lookLines(snapshot)],
            state: snapshot,
          });
        }
      } catch (error) {
        console.error('Postgres hosted command failed', error);
        return baseWorker.fetch(new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(parsed.data),
        }), adaptedEnv);
      }

      return json({
        ok: false,
        playerId,
        requestId,
        code: 'HOSTED_COMMAND_NOT_ENABLED',
        message: 'The hosted slice currently supports LOOK, movement, RESET, and live regional presence. The rest of civilisation remains queued.',
      }, 501);
    }

    return baseWorker.fetch(request, adaptedEnv);
  },
};
