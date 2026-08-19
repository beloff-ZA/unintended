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
      note: 'Foundation runtime only. Authoritative gameplay remains on the Node adapter for now.',
    });
  },
};
