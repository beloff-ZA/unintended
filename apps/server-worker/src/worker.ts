import baseWorker, { PlayerState, Region } from './index';
import {
  ensureHostedPlayerState,
  hostedIdentitySchemaAvailable,
  isMissingHostedPlayerSchemaError,
  readHostedPlayerState,
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
            // Keep a shadow copy during the cutover so rollback does not teleport testers.
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
  try {
    hostedIdentityReady = await hostedIdentitySchemaAvailable(env.HYPERDRIVE);
  } catch (error) {
    console.error('Hosted identity schema probe failed', error);
  }

  return json({
    ...payload,
    hostedIdentityReady,
    playerState: hostedIdentityReady ? 'postgres' : 'durable-object-fallback',
    playerStateFallback: 'durable-object-shadow',
  }, base.status);
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

    return baseWorker.fetch(request, adaptedEnv);
  },
};
