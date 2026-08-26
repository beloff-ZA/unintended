import { Client } from 'pg';

export type HyperdriveBinding = {
  connectionString: string;
};

export type DatabaseProbe = {
  latencyMs: number;
  serverTime?: string;
  database?: string;
};

export type HostedPlayerState = {
  characterId: string;
  locationId: string;
};

export type HostedWorldLocation = {
  id: string;
  name: string;
  x: number;
  y: number;
  exits: Record<string, string>;
};

export type HostedWorldNpc = {
  id: string;
  name: string;
  job: string;
};

export type HostedWorldItem = {
  id: string;
  name: string;
  portable: boolean;
  openable: boolean;
  open: boolean;
};

export type HostedWorldDirection = {
  key: string;
  shape: string;
  label: string;
};

export type HostedWorldSnapshot = {
  location: HostedWorldLocation;
  nearby: {
    npcs: HostedWorldNpc[];
    items: HostedWorldItem[];
  };
};

export type HostedWorldEventInput = {
  type: string;
  actorId: string;
  targetId?: string | null;
  locationId?: string | null;
  requestId?: string | null;
  payload?: Record<string, unknown>;
};

export type HostedWorldEvent = {
  id: string;
  type: string;
  actorId: string;
  targetId: string | null;
  locationId: string | null;
  requestId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type HostedItemMutationResult = {
  ok: boolean;
  code: 'OK' | 'ITEM_NOT_FOUND' | 'ITEM_NOT_PORTABLE' | 'ITEM_NOT_OPENABLE' | 'ALREADY_OPEN';
  item?: HostedWorldItem;
  event?: HostedWorldEvent;
  replayed?: boolean;
};

type EntityRow = {
  id: string;
  name: string;
  portable: boolean;
  openable: boolean;
  open: boolean;
  location_id: string | null;
  owner_id: string | null;
};

type QueryClient = Pick<Client, 'query'>;

const withClient = async <T>(binding: HyperdriveBinding, fn: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: binding.connectionString });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
};

const withTransaction = async <T>(binding: HyperdriveBinding, fn: (client: Client) => Promise<T>): Promise<T> =>
  withClient(binding, async (client) => {
    await client.query('begin');
    try {
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
  });

const mapItemRow = (row: Pick<EntityRow, 'id' | 'name' | 'portable' | 'openable' | 'open'>): HostedWorldItem => ({
  id: row.id,
  name: row.name,
  portable: row.portable,
  openable: row.openable,
  open: row.open,
});

const mapWorldEventRow = (row: {
  id: string;
  type: string;
  actor_id: string;
  target_id: string | null;
  location_id: string | null;
  request_id?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}): HostedWorldEvent => ({
  id: row.id,
  type: row.type,
  actorId: row.actor_id,
  targetId: row.target_id,
  locationId: row.location_id,
  requestId: row.request_id ?? null,
  payload: row.payload ?? {},
  createdAt: row.created_at,
});

const requestIdColumnAvailable = async (client: QueryClient): Promise<boolean> => {
  const result = await client.query<{ available: boolean }>(
    `select exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'world_events'
          and column_name = 'request_id'
     ) as available`,
  );
  return Boolean(result.rows[0]?.available);
};

const readEventByRequestId = async (
  client: QueryClient,
  requestId: string | null | undefined,
  supportsRequestId: boolean,
): Promise<HostedWorldEvent | null> => {
  if (!supportsRequestId || !requestId) return null;
  const result = await client.query(
    `select id, type, actor_id, target_id, location_id, request_id, payload, created_at::text
       from world_events
      where request_id = $1
      limit 1`,
    [requestId],
  );
  return result.rows[0] ? mapWorldEventRow(result.rows[0]) : null;
};

const insertWorldEvent = async (
  client: QueryClient,
  event: HostedWorldEventInput,
  supportsRequestId: boolean,
): Promise<HostedWorldEvent> => {
  if (supportsRequestId) {
    const result = await client.query(
      `insert into world_events (type, actor_id, target_id, location_id, request_id, payload)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (request_id) where request_id is not null do update
         set request_id = excluded.request_id
       returning id, type, actor_id, target_id, location_id, request_id, payload, created_at::text`,
      [
        event.type,
        event.actorId,
        event.targetId ?? null,
        event.locationId ?? null,
        event.requestId ?? null,
        event.payload ?? {},
      ],
    );
    return mapWorldEventRow(result.rows[0]);
  }

  const result = await client.query(
    `insert into world_events (type, actor_id, target_id, location_id, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     returning id, type, actor_id, target_id, location_id, payload, created_at::text`,
    [event.type, event.actorId, event.targetId ?? null, event.locationId ?? null, event.payload ?? {}],
  );
  return mapWorldEventRow(result.rows[0]);
};

const itemForEvent = async (client: QueryClient, event: HostedWorldEvent): Promise<HostedWorldItem | undefined> => {
  if (!event.targetId) return undefined;
  const result = await client.query<EntityRow>(
    `select id, name, portable, openable, open, location_id, owner_id
       from entities
      where id = $1
        and kind = 'item'`,
    [event.targetId],
  );
  return result.rows[0] ? mapItemRow(result.rows[0]) : undefined;
};

export async function probeDatabase(binding: HyperdriveBinding): Promise<DatabaseProbe> {
  const started = Date.now();
  return withClient(binding, async (client) => {
    const result = await client.query<{ server_time: string; database: string }>(
      'select now()::text as server_time, current_database() as database',
    );
    return {
      latencyMs: Date.now() - started,
      serverTime: result.rows[0]?.server_time,
      database: result.rows[0]?.database,
    };
  });
}

export async function hostedIdentitySchemaAvailable(binding: HyperdriveBinding): Promise<boolean> {
  return withClient(binding, async (client) => {
    const result = await client.query<{ identity_table: string | null; character_table: string | null }>(
      "select to_regclass('public.hosted_player_identities')::text as identity_table, to_regclass('public.characters')::text as character_table",
    );
    return Boolean(result.rows[0]?.identity_table && result.rows[0]?.character_table);
  });
}

export async function hostedWorldSchemaAvailable(binding: HyperdriveBinding): Promise<boolean> {
  return withClient(binding, async (client) => {
    const result = await client.query<{
      locations: string | null;
      npc_state: string | null;
      entities: string | null;
      directions: string | null;
    }>(
      "select to_regclass('public.locations')::text as locations, to_regclass('public.npc_state')::text as npc_state, to_regclass('public.entities')::text as entities, to_regclass('public.world_directions')::text as directions",
    );
    return Boolean(
      result.rows[0]?.locations &&
      result.rows[0]?.npc_state &&
      result.rows[0]?.entities &&
      result.rows[0]?.directions,
    );
  });
}

export async function readHostedWorldDirections(
  binding: HyperdriveBinding,
  keys: string[],
): Promise<Map<string, HostedWorldDirection>> {
  if (keys.length === 0) return new Map();

  return withClient(binding, async (client) => {
    const result = await client.query<HostedWorldDirection>(
      `select key, shape, label
         from world_directions
        where key = any($1::text[])
        order by key`,
      [keys],
    );
    return new Map(result.rows.map((direction) => [direction.key, direction]));
  });
}

export async function readHostedWorldSnapshot(
  binding: HyperdriveBinding,
  locationId: string,
): Promise<HostedWorldSnapshot | null> {
  return withClient(binding, async (client) => {
    const locationResult = await client.query<{
      id: string;
      name: string;
      x: number;
      y: number;
      exits: Record<string, string>;
    }>(
      `select id, name, x, y, exits
         from locations
        where id = $1`,
      [locationId],
    );

    const location = locationResult.rows[0];
    if (!location) return null;

    const [npcResult, itemResult] = await Promise.all([
      client.query<{ id: string; name: string; job: string }>(
        `select id, name, job
           from npc_state
          where location_id = $1
          order by id`,
        [locationId],
      ),
      client.query<EntityRow>(
        `select id, name, portable, openable, open, location_id, owner_id
           from entities
          where location_id = $1
            and owner_id is null
            and kind = 'item'
          order by id`,
        [locationId],
      ),
    ]);

    return {
      location: {
        id: location.id,
        name: location.name,
        x: Number(location.x),
        y: Number(location.y),
        exits: location.exits ?? {},
      },
      nearby: {
        npcs: npcResult.rows,
        items: itemResult.rows.map(mapItemRow),
      },
    };
  });
}

export async function readHostedInventory(
  binding: HyperdriveBinding,
  actorId: string,
): Promise<HostedWorldItem[]> {
  return withClient(binding, async (client) => {
    const result = await client.query<EntityRow>(
      `select id, name, portable, openable, open, location_id, owner_id
         from entities
        where owner_id = $1
          and kind = 'item'
        order by name, id`,
      [actorId],
    );
    return result.rows.map(mapItemRow);
  });
}

export async function readHostedPlayerState(
  binding: HyperdriveBinding,
  browserPlayerId: string,
): Promise<HostedPlayerState | null> {
  return withClient(binding, async (client) => {
    const result = await client.query<{ character_id: string; location_id: string }>(
      `select h.character_id, c.location_id
         from hosted_player_identities h
         join characters c on c.id = h.character_id
        where h.browser_player_id = $1`,
      [browserPlayerId],
    );
    const row = result.rows[0];
    return row ? { characterId: row.character_id, locationId: row.location_id } : null;
  });
}

export async function ensureHostedPlayerState(
  binding: HyperdriveBinding,
  browserPlayerId: string,
  initialLocationId: string,
): Promise<HostedPlayerState> {
  return withTransaction(binding, async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [browserPlayerId]);

    const existing = await client.query<{ character_id: string; location_id: string }>(
      `select h.character_id, c.location_id
         from hosted_player_identities h
         join characters c on c.id = h.character_id
        where h.browser_player_id = $1`,
      [browserPlayerId],
    );

    if (existing.rows[0]) {
      return {
        characterId: existing.rows[0].character_id,
        locationId: existing.rows[0].location_id,
      };
    }

    const character = await client.query<{ id: string; location_id: string }>(
      `insert into characters (name, location_id)
       values ($1, $2)
       returning id, location_id`,
      ['Unidentified Participant', initialLocationId],
    );
    const created = character.rows[0];
    if (!created) throw new Error('HOSTED_CHARACTER_CREATE_RETURNED_NO_ROW');

    await client.query(
      `insert into hosted_player_identities (browser_player_id, character_id)
       values ($1, $2)`,
      [browserPlayerId, created.id],
    );

    return { characterId: created.id, locationId: created.location_id };
  });
}

export async function writeHostedPlayerLocation(
  binding: HyperdriveBinding,
  browserPlayerId: string,
  locationId: string,
): Promise<HostedPlayerState> {
  return withClient(binding, async (client) => {
    const result = await client.query<{ character_id: string; location_id: string }>(
      `update characters c
          set location_id = $2
         from hosted_player_identities h
        where h.browser_player_id = $1
          and h.character_id = c.id
      returning c.id as character_id, c.location_id`,
      [browserPlayerId, locationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('HOSTED_PLAYER_IDENTITY_NOT_FOUND');
    return { characterId: row.character_id, locationId: row.location_id };
  });
}

export async function appendHostedWorldEvent(
  binding: HyperdriveBinding,
  event: HostedWorldEventInput,
): Promise<HostedWorldEvent> {
  return withClient(binding, async (client) => {
    const supportsRequestId = await requestIdColumnAvailable(client);
    return insertWorldEvent(client, event, supportsRequestId);
  });
}

export async function readHostedWorldEvents(
  binding: HyperdriveBinding,
  actorId: string,
  limit = 50,
): Promise<HostedWorldEvent[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 50));
  return withClient(binding, async (client) => {
    const supportsRequestId = await requestIdColumnAvailable(client);
    const result = supportsRequestId
      ? await client.query(
          `select id, type, actor_id, target_id, location_id, request_id, payload, created_at::text
             from world_events
            where actor_id = $1
            order by created_at desc
            limit $2`,
          [actorId, safeLimit],
        )
      : await client.query(
          `select id, type, actor_id, target_id, location_id, payload, created_at::text
             from world_events
            where actor_id = $1
            order by created_at desc
            limit $2`,
          [actorId, safeLimit],
        );
    return result.rows.map(mapWorldEventRow);
  });
}

export async function takeHostedItem(
  binding: HyperdriveBinding,
  actorId: string,
  locationId: string,
  requested: string,
  requestId?: string | null,
): Promise<HostedItemMutationResult> {
  return withTransaction(binding, async (client) => {
    const supportsRequestId = await requestIdColumnAvailable(client);
    const replay = await readEventByRequestId(client, requestId, supportsRequestId);
    if (replay) {
      return { ok: true, code: 'OK', item: await itemForEvent(client, replay), event: replay, replayed: true };
    }

    const result = await client.query<EntityRow>(
      `select id, name, portable, openable, open, location_id, owner_id
         from entities
        where kind = 'item'
          and owner_id is null
          and location_id = $1
          and (id = $2 or lower(name) = lower($2))
        order by case when id = $2 then 0 else 1 end, id
        limit 1
        for update`,
      [locationId, requested],
    );
    const row = result.rows[0];
    if (!row) return { ok: false, code: 'ITEM_NOT_FOUND' };
    if (!row.portable) return { ok: false, code: 'ITEM_NOT_PORTABLE', item: mapItemRow(row) };

    const updated = await client.query<EntityRow>(
      `update entities
          set owner_id = $1,
              location_id = null,
              updated_at = now()
        where id = $2
      returning id, name, portable, openable, open, location_id, owner_id`,
      [actorId, row.id],
    );
    const item = mapItemRow(updated.rows[0]);
    const event = await insertWorldEvent(client, {
      type: 'ITEM_TAKEN',
      actorId,
      targetId: row.id,
      locationId,
      requestId,
      payload: { itemName: row.name, fromLocationId: locationId },
    }, supportsRequestId);
    return { ok: true, code: 'OK', item, event };
  });
}

export async function dropHostedItem(
  binding: HyperdriveBinding,
  actorId: string,
  locationId: string,
  requested: string,
  requestId?: string | null,
): Promise<HostedItemMutationResult> {
  return withTransaction(binding, async (client) => {
    const supportsRequestId = await requestIdColumnAvailable(client);
    const replay = await readEventByRequestId(client, requestId, supportsRequestId);
    if (replay) {
      return { ok: true, code: 'OK', item: await itemForEvent(client, replay), event: replay, replayed: true };
    }

    const result = await client.query<EntityRow>(
      `select id, name, portable, openable, open, location_id, owner_id
         from entities
        where kind = 'item'
          and owner_id = $1
          and (id = $2 or lower(name) = lower($2))
        order by case when id = $2 then 0 else 1 end, id
        limit 1
        for update`,
      [actorId, requested],
    );
    const row = result.rows[0];
    if (!row) return { ok: false, code: 'ITEM_NOT_FOUND' };

    const updated = await client.query<EntityRow>(
      `update entities
          set owner_id = null,
              location_id = $1,
              updated_at = now()
        where id = $2
      returning id, name, portable, openable, open, location_id, owner_id`,
      [locationId, row.id],
    );
    const item = mapItemRow(updated.rows[0]);
    const event = await insertWorldEvent(client, {
      type: 'ITEM_DROPPED',
      actorId,
      targetId: row.id,
      locationId,
      requestId,
      payload: { itemName: row.name, toLocationId: locationId },
    }, supportsRequestId);
    return { ok: true, code: 'OK', item, event };
  });
}

export async function openHostedItem(
  binding: HyperdriveBinding,
  actorId: string,
  locationId: string,
  requested: string,
  requestId?: string | null,
): Promise<HostedItemMutationResult> {
  return withTransaction(binding, async (client) => {
    const supportsRequestId = await requestIdColumnAvailable(client);
    const replay = await readEventByRequestId(client, requestId, supportsRequestId);
    if (replay) {
      return { ok: true, code: 'OK', item: await itemForEvent(client, replay), event: replay, replayed: true };
    }

    const result = await client.query<EntityRow>(
      `select id, name, portable, openable, open, location_id, owner_id
         from entities
        where kind = 'item'
          and (owner_id = $1 or (owner_id is null and location_id = $2))
          and (id = $3 or lower(name) = lower($3))
        order by case when id = $3 then 0 else 1 end, id
        limit 1
        for update`,
      [actorId, locationId, requested],
    );
    const row = result.rows[0];
    if (!row) return { ok: false, code: 'ITEM_NOT_FOUND' };
    if (!row.openable) return { ok: false, code: 'ITEM_NOT_OPENABLE', item: mapItemRow(row) };
    if (row.open) return { ok: true, code: 'ALREADY_OPEN', item: mapItemRow(row) };

    const updated = await client.query<EntityRow>(
      `update entities
          set open = true,
              updated_at = now()
        where id = $1
      returning id, name, portable, openable, open, location_id, owner_id`,
      [row.id],
    );
    const item = mapItemRow(updated.rows[0]);
    const event = await insertWorldEvent(client, {
      type: 'ITEM_OPENED',
      actorId,
      targetId: row.id,
      locationId,
      requestId,
      payload: { itemName: row.name, owned: row.owner_id === actorId },
    }, supportsRequestId);
    return { ok: true, code: 'OK', item, event };
  });
}

export const isMissingHostedPlayerSchemaError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01';
