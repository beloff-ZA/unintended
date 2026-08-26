import { ClientCommand } from '@unintended/shared';
import { buildWorld, DEFAULT_WORLD_SEED, ITEMS, NPCS } from '@unintended/world-data';
import { probeDatabase, type HyperdriveBinding } from './db';

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

type CloudflareWebSocket = WebSocket & {
  serializeAttachment(value: unknown): void;
  deserializeAttachment<T>(): T | null;
};

type DurableObjectContext = {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
  };
  acceptWebSocket(ws: WebSocket): void;
  getWebSockets(): CloudflareWebSocket[];
};

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

type StoredPlayerState = {
  locationId: string;
};

type RegionAttachment = {
  playerId: string;
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

const playPage = () => new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>UNINTENDED</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#0d0f0e;color:#e7e3d8}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#171b18 0,#0d0f0e 55%);display:grid;place-items:center;padding:24px}.shell{width:min(980px,100%);border:1px solid #3a403a;background:#111411;box-shadow:0 24px 80px #0008}.top{display:flex;justify-content:space-between;gap:20px;padding:18px 22px;border-bottom:1px solid #303630}.top h1{margin:0;font-size:18px;letter-spacing:.22em}.top small{color:#8f9b8f}.status{font-size:12px;color:#a7b6a7}.body{display:grid;grid-template-columns:minmax(0,1fr) 250px;min-height:620px}.terminal{display:flex;flex-direction:column;min-width:0}.output{flex:1;overflow:auto;padding:24px;white-space:pre-wrap;line-height:1.55;font-size:16px}.line.input{color:#9ab7ff}.line.error{color:#ffb2a8}.line.system{color:#9aa39a}.line.live{color:#b7d7ae}.entry{display:flex;border-top:1px solid #303630;background:#0b0d0c}.entry span{padding:16px 0 16px 18px;color:#7f8f7f}.entry input{flex:1;border:0;background:transparent;color:#f3efe4;padding:16px 18px;font:inherit;font-size:16px;outline:none}.side{border-left:1px solid #303630;padding:20px;background:#0e110f}.side h2{margin:0 0 16px;font-size:12px;letter-spacing:.15em;color:#9aa39a}.location{font-size:18px;margin-bottom:8px}.live-count{font-size:12px;color:#a7b6a7;margin-bottom:18px}.exits{display:grid;gap:9px}.exits button,.reset{width:100%;text-align:left;border:1px solid #394039;background:#151916;color:#e7e3d8;padding:11px 12px;font:inherit;cursor:pointer}.exits button:hover,.reset:hover{background:#1d231e}.meta{margin-top:24px;font-size:12px;line-height:1.5;color:#899489}.reset{margin-top:18px;color:#c8b9a4}@media(max-width:760px){body{padding:0}.shell{min-height:100vh;border:0}.body{grid-template-columns:1fr}.side{border-left:0;border-top:1px solid #303630;min-height:0}.output{min-height:52vh}}
</style>
</head>
<body>
<main class="shell">
  <header class="top"><div><h1>UNINTENDED</h1><small>Hosted development slice</small></div><div class="status" id="status">connecting</div></header>
  <section class="body">
    <div class="terminal">
      <div class="output" id="output"></div>
      <form class="entry" id="form"><span>&gt;</span><input id="input" autocomplete="off" maxlength="240" placeholder="Tell the world what you intend." autofocus /></form>
    </div>
    <aside class="side">
      <h2>CURRENT CONTEXT</h2>
      <div class="location" id="location">Unknown</div>
      <div class="live-count" id="live">LIVE: connecting</div>
      <div class="exits" id="exits"></div>
      <button class="reset" id="reset">RESET LOCATION</button>
      <div class="meta" id="meta"></div>
    </aside>
  </section>
</main>
<script>
const output=document.getElementById('output');
const form=document.getElementById('form');
const input=document.getElementById('input');
const locationEl=document.getElementById('location');
const exitsEl=document.getElementById('exits');
const statusEl=document.getElementById('status');
const liveEl=document.getElementById('live');
const metaEl=document.getElementById('meta');
const resetEl=document.getElementById('reset');
let playerId=localStorage.getItem('unintended-player-id');
if(!playerId){playerId='web-'+crypto.randomUUID();localStorage.setItem('unintended-player-id',playerId);}
let counter=0;
let regionSocket=null;
let regionLocation=null;
let socketGeneration=0;
function add(text,kind=''){const row=document.createElement('div');row.className='line '+kind;row.textContent=text||' ';output.appendChild(row);output.scrollTop=output.scrollHeight;}
function connectRegion(locationId){if(!locationId||regionLocation===locationId&&regionSocket&&(regionSocket.readyState===WebSocket.OPEN||regionSocket.readyState===WebSocket.CONNECTING))return;regionLocation=locationId;const generation=++socketGeneration;if(regionSocket)regionSocket.close(1000,'region change');const proto=location.protocol==='https:'?'wss':'ws';const socket=new WebSocket(proto+'://'+location.host+'/ws?player='+encodeURIComponent(playerId));regionSocket=socket;liveEl.textContent='LIVE: connecting';socket.onopen=()=>{if(generation!==socketGeneration)return;statusEl.textContent='live';};socket.onmessage=event=>{if(generation!==socketGeneration)return;try{const message=JSON.parse(event.data);if(message.type==='LIVE_STATE'){liveEl.textContent='LIVE: '+message.online+' connected';return;}if(message.type==='PRESENCE'){add(String(message.text||'Something changed nearby.'),'live');if(Number.isFinite(message.online))liveEl.textContent='LIVE: '+message.online+' connected';return;}if(message.type==='PONG')return;}catch{};};socket.onclose=()=>{if(generation!==socketGeneration)return;liveEl.textContent='LIVE: disconnected';statusEl.textContent='connected';};socket.onerror=()=>{if(generation!==socketGeneration)return;liveEl.textContent='LIVE: unavailable';};}
function renderState(state){if(!state)return;locationEl.textContent=state.location?.name||'Unknown';exitsEl.replaceChildren();for(const exit of state.exits||[]){const button=document.createElement('button');button.textContent=exit.shape+' '+exit.label;button.title='Go to '+exit.targetName;button.onclick=()=>send('go '+exit.label);exitsEl.appendChild(button);}metaEl.textContent='PLAYER '+playerId.slice(0,18)+'… · SEED '+state.seed;connectRegion(state.location?.id);}
async function send(text){const command=text.trim();if(!command)return;add('> '+command,'input');input.value='';statusEl.textContent='thinking';try{const response=await fetch('/command',{method:'POST',headers:{'content-type':'application/json','x-player-id':playerId},body:JSON.stringify({type:'COMMAND',text:command,requestId:'web-'+(++counter)})});const data=await response.json();for(const line of data.lines||[data.message||'The Server produced no useful sentence.'])add(String(line),response.ok?'':'error');renderState(data.state);statusEl.textContent=response.ok?'connected':'objecting';}catch(error){add('The hosted Server could not be reached. This is inconveniently literal.','error');statusEl.textContent='disconnected';}}
form.addEventListener('submit',event=>{event.preventDefault();send(input.value);});
resetEl.addEventListener('click',()=>send('reset'));
send('look');
</script>
</body>
</html>`, {
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  },
});

export class PlayerState {
  constructor(private readonly ctx: DurableObjectContext) {}

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

export class Region {
  constructor(private readonly ctx: DurableObjectContext) {}

  private broadcast(data: unknown, except?: WebSocket) {
    const payload = JSON.stringify(data);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except || socket.readyState !== WebSocket.OPEN) continue;
      try { socket.send(payload); } catch {}
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ ok: false, code: 'WEBSOCKET_UPGRADE_REQUIRED' }, { status: 426 });
    }

    const url = new URL(request.url);
    const playerId = url.searchParams.get('player')?.trim();
    const locationId = url.searchParams.get('location')?.trim();
    if (!playerId || !locationId) {
      return json({ ok: false, code: 'REGION_CONTEXT_REQUIRED' }, { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as CloudflareWebSocket;
    server.serializeAttachment({ playerId, locationId } satisfies RegionAttachment);
    this.ctx.acceptWebSocket(server);

    const online = this.ctx.getWebSockets().length;
    server.send(JSON.stringify({ type: 'LIVE_STATE', locationId, online, at: new Date().toISOString() }));
    this.broadcast({
      type: 'PRESENCE',
      text: 'Someone became locally relevant.',
      locationId,
      online,
      at: new Date().toISOString(),
    }, server);

    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  async webSocketMessage(ws: CloudflareWebSocket, message: ArrayBuffer | string) {
    if (typeof message !== 'string') return;
    try {
      const parsed = JSON.parse(message) as { type?: string };
      if (parsed.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', at: new Date().toISOString() }));
      }
    } catch {}
  }

  async webSocketClose(ws: CloudflareWebSocket, code: number, reason: string, wasClean: boolean) {
    const attachment = ws.deserializeAttachment<RegionAttachment>();
    try { ws.close(code, reason); } catch {}
    const online = Math.max(0, this.ctx.getWebSockets().length - 1);
    this.broadcast({
      type: 'PRESENCE',
      text: 'Someone ceased to be locally relevant.',
      locationId: attachment?.locationId,
      online,
      clean: wasClean,
      at: new Date().toISOString(),
    }, ws);
  }

  async webSocketError(ws: CloudflareWebSocket) {
    const attachment = ws.deserializeAttachment<RegionAttachment>();
    try { ws.close(1011, 'region socket error'); } catch {}
    const online = Math.max(0, this.ctx.getWebSockets().length - 1);
    this.broadcast({
      type: 'PRESENCE',
      text: 'Someone became abruptly less locally relevant.',
      locationId: attachment?.locationId,
      online,
      at: new Date().toISOString(),
    }, ws);
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
const regionStub = (env: WorkerEnv, locationId: string) => env.REGION.get(env.REGION.idFromName(locationId));

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

    if (request.method === 'GET' && url.pathname === '/') {
      return Response.redirect(new URL('/play', url), 302);
    }

    if (request.method === 'GET' && url.pathname === '/play') {
      return playPage();
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'unintended-api',
        runtime: 'cloudflare-workers',
        environment: env.DEPLOYMENT_ENV ?? 'unknown',
        playerState: 'durable-object',
        regionTransport: 'durable-object-websocket-hibernation',
        databaseTransport: 'hyperdrive-postgres',
        playable: '/play',
      });
    }

    if (request.method === 'GET' && url.pathname === '/db/health') {
      try {
        const database = await probeDatabase(env.HYPERDRIVE);
        return json({
          ok: true,
          service: 'unintended-api',
          transport: 'cloudflare-hyperdrive',
          ...database,
        });
      } catch (error) {
        console.error('Hyperdrive database probe failed', error);
        return json({
          ok: false,
          service: 'unintended-api',
          transport: 'cloudflare-hyperdrive',
          code: 'DATABASE_UNAVAILABLE',
          message: 'PostgreSQL declined to participate in this particular moment.',
        }, { status: 503 });
      }
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

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return json({ ok: false, code: 'WEBSOCKET_UPGRADE_REQUIRED' }, { status: 426 });
      }
      const playerId = playerIdFor(request, url);
      const stored = await readPlayerState(env, playerId);
      const internal = new URL('https://region/connect');
      internal.searchParams.set('player', playerId);
      internal.searchParams.set('location', stored.locationId);
      return regionStub(env, stored.locationId).fetch(new Request(internal, request));
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
        return json({ ok: true, playerId, requestId, command, lines: lookLines(snapshot), state: snapshot });
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
          lines: [`You take ${exit.shape} ${exit.label}.`, ...lookLines(snapshot)],
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

      return json({
        ok: false,
        playerId,
        requestId,
        code: 'HOSTED_COMMAND_NOT_ENABLED',
        message: 'The hosted slice currently supports LOOK, movement, RESET, and live regional presence. The rest of civilisation remains queued.',
      }, { status: 501 });
    }

    return json({
      ok: true,
      service: 'unintended-api',
      runtime: 'cloudflare-workers',
      note: 'Hosted movement, Region Durable Object WebSockets, and Hyperdrive health probing are active.',
    });
  },
};
