import { ClientCommand } from '@unintended/shared';
import { buildWorld, DEFAULT_WORLD_SEED, ITEMS, NPCS } from '@unintended/world-data';

type DurableObjectBinding = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
};

type WorkerEnv = {
  DEPLOYMENT_ENV?: string;
  PLAYER_STATE: DurableObjectBinding;
};

type StoredPlayerState = {
  locationId: string;
};

const START_LOCATION = 'bellweather-square';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers ?? {}),
    },
  });

export class PlayerState {
  constructor(private readonly ctx: { storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> } }) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/state') {
      const locationId = (await this.ctx.storage.get<string>('locationId')) ?? START_LOCATION;
      return json({ locationId });
    }

    if (request.method === 'POST' && url.pathname === '/move') {
      const body = (await request.json()) as Partial<StoredPlayerState>;
      const locationId = typeof body.locationId === 'string' && body.locationId.trim() ? body.locationId.trim() : START_LOCATION;
      await this.ctx.storage.put('locationId', locationId);
      return json({ locationId });
    }

    if (request.method === 'POST' && url.pathname === '/reset') {
      await this.ctx.storage.put('locationId', START_LOCATION);
      return json({ locationId: START_LOCATION });
    }

    return json({ ok: false, code: 'PLAYER_STATE_ROUTE_NOT_FOUND' }, { status: 404 });
  }
}

const hostedWorld = () => buildWorld(DEFAULT_WORLD_SEED);

const worldSnapshot = (locationId = START_LOCATION) => {
  const world = hostedWorld();
  const location = world.locations.find((entry) => entry.id === locationId) ?? world.locations[0]!;
  const directions = new Map(world.directions.map((direction) => [direction.key, direction]));
  const locations = new Map(world.locations.map((entry) => [entry.id, entry]));

  return {
    seed: world.seed,
    location: {
      id: location.id,
      name: location.name,
      x: location.x,
      y: location.y,
    },
    exits: Object.entries(location.exits).map(([directionKey, targetId]) => {
      const direction = directions.get(directionKey);
      const target = locations.get(targetId);
      return {
        key: directionKey,
        label: direction?.label ?? directionKey,
        shape: direction?.shape ?? '?',
        targetId,
        targetName: target?.name ?? targetId,
      };
    }),
    nearby: {
      npcs: NPCS.filter((npc) => npc.locationId === location.id).map((npc) => ({ id: npc.id, name: npc.name, job: npc.job })),
      items: ITEMS.filter((item) => item.locationId === location.id).map((item) => ({ id: item.id, name: item.name })),
    },
  };
};

const playerIdFor = (request: Request, url: URL) =>
  request.headers.get('x-player-id')?.trim() || url.searchParams.get('player')?.trim() || 'dev-player-1';

const playerStub = (env: WorkerEnv, playerId: string) => env.PLAYER_STATE.get(env.PLAYER_STATE.idFromName(playerId));

const readPlayerState = async (env: WorkerEnv, playerId: string): Promise<StoredPlayerState> => {
  const response = await playerStub(env, playerId).fetch('https://player-state/state');
  if (!response.ok) throw new Error('PLAYER_STATE_READ_FAILED');
  return response.json() as Promise<StoredPlayerState>;
};

const writePlayerLocation = async (env: WorkerEnv, playerId: string, locationId: string): Promise<StoredPlayerState> => {
  const response = await playerStub(env, playerId).fetch('https://player-state/move', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locationId }),
  });
  if (!response.ok) throw new Error('PLAYER_STATE_WRITE_FAILED');
  return response.json() as Promise<StoredPlayerState>;
};

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const resolveExit = (locationId: string, requested: string) => {
  const snapshot = worldSnapshot(locationId);
  const wanted = normalise(requested);
  return snapshot.exits.find((exit) =>
    [exit.key, exit.label, exit.targetId, exit.targetName, `${exit.shape} ${exit.label}`]
      .map(normalise)
      .includes(wanted),
  );
};

const lookLines = (snapshot: ReturnType<typeof worldSnapshot>) => [
  snapshot.location.name,
  snapshot.exits.length
    ? `Ways out: ${snapshot.exits.map((exit) => `${exit.shape} ${exit.label}`).join(', ')}`
    : 'There are no obvious ways out. This is either important or poor planning.',
  snapshot.nearby.npcs.length ? `Nearby: ${snapshot.nearby.npcs.map((npc) => npc.name).join(', ')}` : 'Nobody nearby appears professionally relevant.',
  snapshot.nearby.items.length ? `Visible: ${snapshot.nearby.items.map((item) => item.name).join(', ')}` : 'Nothing portable is volunteering for attention.',
];

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'unintended-api',
        runtime: 'cloudflare-workers',
        environment: env.DEPLOYMENT_ENV ?? 'unknown',
        playerState: 'durable-object',
      });
    }

    if (request.method === 'GET' && url.pathname === '/world') {
      const playerId = playerIdFor(request, url);
      const stored = await readPlayerState(env, playerId);
      return json({
        ok: true,
        playerId,
        authoritativePlayerLocation: true,
        ...worldSnapshot(stored.locationId),
      });
    }

    if (request.method === 'POST' && url.pathname === '/command') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, code: 'INVALID_JSON', message: 'The Server expected JSON and received interpretive dance.' }, { status: 400 });
      }

      const parsed = ClientCommand.safeParse(body);
      if (!parsed.success) {
        return json({ ok: false, code: 'INVALID_COMMAND', message: 'The Server declines to understand that packet.' }, { status: 400 });
      }

      const playerId = playerIdFor(request, url);
      const requestId = parsed.data.requestId;
      const command = parsed.data.text.trim();
      const stored = await readPlayerState(env, playerId);

      if (/^(?:look|look around|where am i)$/i.test(command)) {
        const snapshot = worldSnapshot(stored.locationId);
        return json({
          ok: true,
          playerId,
          requestId,
          command,
          lines: lookLines(snapshot),
          state: snapshot,
        });
      }

      const movement = command.match(/^(?:go|move|walk|travel)(?:\s+(?:to|via))?\s+(.+)$/i);
      if (movement) {
        const current = worldSnapshot(stored.locationId);
        const exit = resolveExit(current.location.id, movement[1]!);
        if (!exit) {
          return json({
            ok: false,
            playerId,
            requestId,
            code: 'NO_SUCH_EXIT',
            lines: [
              `You cannot get there from ${current.location.name} by that description.`,
              current.exits.length
                ? `Available: ${current.exits.map((candidate) => `${candidate.shape} ${candidate.label}`).join(', ')}`
                : 'There are, inconveniently, no available exits.',
            ],
            state: current,
          }, { status: 400 });
        }

        await writePlayerLocation(env, playerId, exit.targetId);
        const snapshot = worldSnapshot(exit.targetId);
        return json({
          ok: true,
          playerId,
          requestId,
          command,
          moved: true,
          lines: [
            `You take ${exit.shape} ${exit.label}.`,
            ...lookLines(snapshot),
          ],
          state: snapshot,
        });
      }

      if (/^(?:reset|reset location|return to start)$/i.test(command)) {
        await writePlayerLocation(env, playerId, START_LOCATION);
        const snapshot = worldSnapshot(START_LOCATION);
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

      return json(
        {
          ok: false,
          playerId,
          requestId,
          code: 'HOSTED_COMMAND_NOT_ENABLED',
          message: 'The hosted slice currently supports LOOK, movement, and RESET. The rest of civilisation remains queued.',
        },
        { status: 501 },
      );
    }

    if (url.pathname === '/ws') {
      return json(
        {
          ok: false,
          code: 'WEBSOCKET_ADAPTER_NOT_ENABLED',
          message: 'The Cloudflare transport exists, but multiplayer transport has not been migrated yet.',
        },
        { status: 501 },
      );
    }

    return json({
      ok: true,
      service: 'unintended-api',
      runtime: 'cloudflare-workers',
      note: 'Hosted LOOK and persistent movement are available at /command. Player location is stored in a Durable Object.',
    });
  },
};
