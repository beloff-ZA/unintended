import { Client } from 'pg';

export type HyperdriveBinding = {
  connectionString: string;
};

export type DatabaseProbe = {
  ok: boolean;
  latencyMs: number;
  serverTime?: string;
  database?: string;
};

export type HostedPlayerState = {
  characterId: string;
  locationId: string;
};

const withClient = async <T>(binding: HyperdriveBinding, fn: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: binding.connectionString });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
};

export async function probeDatabase(binding: HyperdriveBinding): Promise<DatabaseProbe> {
  const started = Date.now();
  return withClient(binding, async (client) => {
    const result = await client.query<{ server_time: string; database: string }>(
      'select now()::text as server_time, current_database() as database',
    );
    return {
      ok: true,
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
  return withClient(binding, async (client) => {
    await client.query('begin');
    try {
      // Serialise first-seen creation for this browser identity. Hash collisions only
      // serialise unrelated first joins; they do not merge identities.
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [browserPlayerId]);

      const existing = await client.query<{ character_id: string; location_id: string }>(
        `select h.character_id, c.location_id
           from hosted_player_identities h
           join characters c on c.id = h.character_id
          where h.browser_player_id = $1`,
        [browserPlayerId],
      );

      if (existing.rows[0]) {
        await client.query('commit');
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

      await client.query('commit');
      return { characterId: created.id, locationId: created.location_id };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
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

export const isMissingHostedPlayerSchemaError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01';
