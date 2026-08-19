import { ClientCommand } from '@unintended/shared';
import { buildWorld, DEFAULT_WORLD_SEED, ITEMS, NPCS } from '@unintended/world-data';

type WorkerEnv = {
  DEPLOYMENT_ENV?: string;
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers ?? {}),
    },
  });

const hostedWorld = () => buildWorld(DEFAULT_WORLD_SEED);

const worldSnapshot = (locationId = 'bellweather-square') => {
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

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'unintended-api',
        runtime: 'cloudflare-workers',
        environment: env.DEPLOYMENT_ENV ?? 'unknown',
      });
    }

    if (request.method === 'GET' && url.pathname === '/world') {
      return json({
        ok: true,
        authoritative: false,
        note: 'Hosted read-only world slice. Player persistence is not enabled on the Worker yet.',
        ...worldSnapshot(url.searchParams.get('location') ?? undefined),
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

      const requestId = parsed.data.requestId;
      const command = parsed.data.text.trim();
      if (/^(?:look|look around|where am i)$/i.test(command)) {
        const snapshot = worldSnapshot(url.searchParams.get('location') ?? undefined);
        return json({
          ok: true,
          requestId,
          command,
          lines: [
            snapshot.location.name,
            snapshot.exits.length
              ? `Ways out: ${snapshot.exits.map((exit) => `${exit.shape} ${exit.label}`).join(', ')}`
              : 'There are no obvious ways out. This is either important or poor planning.',
            snapshot.nearby.npcs.length ? `Nearby: ${snapshot.nearby.npcs.map((npc) => npc.name).join(', ')}` : 'Nobody nearby appears professionally relevant.',
            snapshot.nearby.items.length ? `Visible: ${snapshot.nearby.items.map((item) => item.name).join(', ')}` : 'Nothing portable is volunteering for attention.',
          ],
          state: snapshot,
        });
      }

      return json(
        {
          ok: false,
          requestId,
          code: 'HOSTED_COMMAND_NOT_ENABLED',
          message: 'The hosted slice currently permits LOOK only. Mutation arrives after persistence is connected.',
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
      note: 'Hosted read-only world and LOOK command are available at /world and /command. Authoritative mutation remains on the Node adapter for now.',
    });
  },
};
