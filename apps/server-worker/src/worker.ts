import { ClientCommand } from '@unintended/shared';
import { DEFAULT_WORLD_SEED } from '@unintended/world-data';
import baseWorker, { PlayerState, Region } from './index';
import {
  appendHostedWorldEvent,
  dropHostedItem,
  ensureHostedPlayerState,
  hostedIdentitySchemaAvailable,
  hostedWorldSchemaAvailable,
  isMissingHostedPlayerSchemaError,
  openHostedItem,
  readHostedInventory,
  readHostedPlayerState,
  readHostedWorldDirections,
  readHostedWorldEvents,
  readHostedWorldSnapshot,
  takeHostedItem,
  writeHostedPlayerLocation,
  type HostedItemMutationResult,
  type HostedWorldItem,
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

type HostedPlayer = {
  locationId: string;
  characterId?: string;
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
    eventState: hostedWorldReady ? 'postgres' : 'unavailable',
    gameplayState: hostedIdentityReady && hostedWorldReady ? 'postgres-transactional' : 'unavailable',
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

const inventoryLines = (items: HostedWorldItem[]) => [
  items.length
    ? `Carrying: ${items.map((item) => item.name).join(', ')}`
    : 'You are carrying nothing. Admirably low administrative overhead.',
];

const mutationFailureLines = (result: HostedItemMutationResult, requested: string) => {
  switch (result.code) {
    case 'ITEM_NOT_PORTABLE':
      return [`${result.item?.name ?? requested} declines to become luggage.`];
    case 'ITEM_NOT_OPENABLE':
      return [`${result.item?.name ?? requested} has no meaningful relationship with the concept of opening.`];
    case 'ITEM_NOT_FOUND':
    default:
      return [`No available item answers to “${requested}”.`];
  }
};

const ensurePlayer = async (_env: WorkerEnv, adaptedEnv: WorkerEnv, playerId: string): Promise<HostedPlayer> => {
  const response = await adaptedEnv.PLAYER_STATE
    .get(adaptedEnv.PLAYER_STATE.idFromName(playerId))
    .fetch('https://player-state/state');
  if (!response.ok) throw new Error('PLAYER_STATE_READ_FAILED');
  return response.json() as Promise<HostedPlayer>;
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
  return response.json() as Promise<HostedPlayer>;
};

const actorIdFor = (player: HostedPlayer, playerId: string) => player.characterId ?? playerId;

const characterIdFor = (player: HostedPlayer) => {
  if (!player.characterId) throw new Error('HOSTED_CHARACTER_ID_REQUIRED');
  return player.characterId;
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

    if (request.method === 'GET' && url.pathname === '/events') {
      try {
        const playerId = playerIdFor(request, url);
        const player = await ensurePlayer(env, adaptedEnv, playerId);
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const events = await readHostedWorldEvents(env.HYPERDRIVE, actorIdFor(player, playerId), limit);
        return json({ ok: true, playerId, events, authority: 'postgres' });
      } catch (error) {
        console.error('Postgres event history read failed', error);
        return json({ ok: false, code: 'EVENT_HISTORY_UNAVAILABLE' }, 503);
      }
    }

    if (request.method === 'GET' && url.pathname === '/inventory') {
      try {
        const playerId = playerIdFor(request, url);
        const player = await ensurePlayer(env, adaptedEnv, playerId);
        const inventory = await readHostedInventory(env.HYPERDRIVE, characterIdFor(player));
        return json({ ok: true, playerId, inventory, lines: inventoryLines(inventory), authority: 'postgres' });
      } catch (error) {
        console.error('Postgres inventory read failed', error);
        return json({ ok: false, code: 'INVENTORY_UNAVAILABLE' }, 503);
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
        const actorId = actorIdFor(player, playerId);

        if (/^(?:look|look around|where am i)$/i.test(command)) {
          const snapshot = await publicSnapshot(env, player.locationId);
          if (!snapshot) return json({ ok: false, code: 'WORLD_LOCATION_NOT_FOUND' }, 500);
          const event = await appendHostedWorldEvent(env.HYPERDRIVE, {
            type: 'PLAYER_LOOKED',
            actorId,
            locationId: player.locationId,
            requestId,
            payload: { command },
          });
          return json({ ok: true, playerId, requestId, command, eventId: event.id, lines: lookLines(snapshot), state: snapshot });
        }

        if (/^(?:inventory|inv|i)$/i.test(command)) {
          const inventory = await readHostedInventory(env.HYPERDRIVE, characterIdFor(player));
          return json({ ok: true, playerId, requestId, command, inventory, lines: inventoryLines(inventory), authority: 'postgres' });
        }

        const take = command.match(/^(?:take|get|pick up)\s+(.+)$/i);
        if (take) {
          const requested = take[1]!.trim();
          const result = await takeHostedItem(
            env.HYPERDRIVE,
            characterIdFor(player),
            player.locationId,
            requested,
            requestId,
          );
          if (!result.ok) {
            return json({ ok: false, playerId, requestId, code: result.code, lines: mutationFailureLines(result, requested) }, 400);
          }
          const [inventory, snapshot] = await Promise.all([
            readHostedInventory(env.HYPERDRIVE, characterIdFor(player)),
            publicSnapshot(env, player.locationId),
          ]);
          return json({
            ok: true,
            playerId,
            requestId,
            command,
            eventId: result.event?.id,
            replayed: result.replayed ?? false,
            item: result.item,
            inventory,
            lines: [`You take ${result.item?.name ?? requested}.`, ...inventoryLines(inventory)],
            state: snapshot,
          });
        }

        const drop = command.match(/^(?:drop|leave)\s+(.+)$/i);
        if (drop) {
          const requested = drop[1]!.trim();
          const result = await dropHostedItem(
            env.HYPERDRIVE,
            characterIdFor(player),
            player.locationId,
            requested,
            requestId,
          );
          if (!result.ok) {
            return json({ ok: false, playerId, requestId, code: result.code, lines: mutationFailureLines(result, requested) }, 400);
          }
          const [inventory, snapshot] = await Promise.all([
            readHostedInventory(env.HYPERDRIVE, characterIdFor(player)),
            publicSnapshot(env, player.locationId),
          ]);
          return json({
            ok: true,
            playerId,
            requestId,
            command,
            eventId: result.event?.id,
            replayed: result.replayed ?? false,
            item: result.item,
            inventory,
            lines: [`You drop ${result.item?.name ?? requested}.`, ...inventoryLines(inventory)],
            state: snapshot,
          });
        }

        const open = command.match(/^open\s+(.+)$/i);
        if (open) {
          const requested = open[1]!.trim();
          const result = await openHostedItem(
            env.HYPERDRIVE,
            characterIdFor(player),
            player.locationId,
            requested,
            requestId,
          );
          if (!result.ok) {
            return json({ ok: false, playerId, requestId, code: result.code, lines: mutationFailureLines(result, requested) }, 400);
          }
          const snapshot = await publicSnapshot(env, player.locationId);
          const alreadyOpen = result.code === 'ALREADY_OPEN';
          return json({
            ok: true,
            playerId,
            requestId,
            command,
            eventId: result.event?.id,
            replayed: result.replayed ?? false,
            item: result.item,
            lines: [
              alreadyOpen
                ? `${result.item?.name ?? requested} is already open. Repetition has not improved it.`
                : `You open ${result.item?.name ?? requested}.`,
            ],
            state: snapshot,
          });
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

          const fromLocationId = player.locationId;
          const updatedPlayer = await writePlayerLocation(adaptedEnv, playerId, resolved.exit.targetId);
          const snapshot = await publicSnapshot(env, resolved.exit.targetId);
          if (!snapshot) return json({ ok: false, code: 'WORLD_LOCATION_NOT_FOUND' }, 500);
          const event = await appendHostedWorldEvent(env.HYPERDRIVE, {
            type: 'PLAYER_MOVED',
            actorId: actorIdFor(updatedPlayer, playerId),
            targetId: resolved.exit.targetId,
            locationId: resolved.exit.targetId,
            requestId,
            payload: {
              command,
              fromLocationId,
              toLocationId: resolved.exit.targetId,
              directionKey: resolved.exit.key,
              directionLabel: resolved.exit.label,
            },
          });
          return json({
            ok: true,
            playerId,
            requestId,
            command,
            eventId: event.id,
            moved: true,
            lines: [`You take ${resolved.exit.shape} ${resolved.exit.label}.`, ...lookLines(snapshot)],
            state: snapshot,
          });
        }

        if (/^(?:reset|reset location|return to start)$/i.test(command)) {
          const fromLocationId = player.locationId;
          const updatedPlayer = await writePlayerLocation(adaptedEnv, playerId, START_LOCATION);
          const snapshot = await publicSnapshot(env, START_LOCATION);
          if (!snapshot) return json({ ok: false, code: 'WORLD_LOCATION_NOT_FOUND' }, 500);
          const event = await appendHostedWorldEvent(env.HYPERDRIVE, {
            type: 'PLAYER_MOVED',
            actorId: actorIdFor(updatedPlayer, playerId),
            targetId: START_LOCATION,
            locationId: START_LOCATION,
            requestId,
            payload: { command, fromLocationId, toLocationId: START_LOCATION, reset: true },
          });
          return json({
            ok: true,
            playerId,
            requestId,
            command,
            eventId: event.id,
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
        message: 'The hosted slice supports LOOK, movement, TAKE, DROP, OPEN, INVENTORY, RESET, live regional presence, and persistent event history. The remaining civilisation is smaller now.',
      }, 501);
    }

    return baseWorker.fetch(request, adaptedEnv);
  },
};
