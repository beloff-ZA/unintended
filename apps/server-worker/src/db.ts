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

export async function probeDatabase(binding: HyperdriveBinding): Promise<DatabaseProbe> {
  const started = Date.now();
  const client = new Client({ connectionString: binding.connectionString });
  try {
    await client.connect();
    const result = await client.query<{ server_time: string; database: string }>(
      'select now()::text as server_time, current_database() as database',
    );
    return {
      ok: true,
      latencyMs: Date.now() - started,
      serverTime: result.rows[0]?.server_time,
      database: result.rows[0]?.database,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}
