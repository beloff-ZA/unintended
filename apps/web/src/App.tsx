import { useEffect, useMemo, useRef, useState } from 'react';

type Line = { id: number; text: string; kind?: 'system' | 'input' };
type Direction = { key: string; shape: string; label: string };
type MemoryNode = { id: string; name: string | null; x: number; y: number; status: 'visited' | 'inferred'; current: boolean };
type MemoryEdge = { from: string; to: string; directionKey: string; shape: string; label: string; status: 'known' | 'inferred' };
type Memory = { directionCount: number; nodes: MemoryNode[]; edges: MemoryEdge[]; directions: Direction[] };
type PlayerState = { id: string; name: string; locationId: string };

type Category = { id: string; label: string; actions: string[] };
const CATEGORIES: Category[] = [
  { id: 'PERCEPTION', label: 'Perception', actions: ['LOOK', 'READ'] },
  { id: 'MOVEMENT', label: 'Movement', actions: ['MOVE'] },
  { id: 'HANDLING', label: 'Handling', actions: ['TAKE', 'DROP', 'OPEN'] },
  { id: 'EXCHANGE', label: 'Exchange', actions: ['GIVE', 'BUY', 'SELL'] },
  { id: 'INTERACTION', label: 'Interaction', actions: ['HELP'] },
  { id: 'INQUIRY', label: 'Inquiry', actions: ['INQUIRE'] },
];

function MemoryField({ memory }: { memory: Memory | null }) {
  if (!memory || !memory.nodes.length) return <div className="memory-empty">Nothing has become memorable yet.</div>;
  const nodeById = new Map(memory.nodes.map((node) => [node.id, node]));
  const xs = memory.nodes.map((node) => node.x);
  const ys = memory.nodes.map((node) => node.y);
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;
  const scale = 34;
  const width = Math.max(170, (maxX - minX) * scale);
  const height = Math.max(170, (maxY - minY) * scale);
  const point = (node: MemoryNode) => ({ x: (node.x - minX) * scale, y: (node.y - minY) * scale });

  return (
    <>
      <div className="memory-map">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Discovered world memory">
          {memory.edges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            const a = point(from);
            const b = point(to);
            return (
              <g key={`${edge.from}-${edge.directionKey}-${edge.to}`} className={`memory-edge ${edge.status}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4}>{edge.shape}</text>
              </g>
            );
          })}
          {memory.nodes.map((node) => {
            const p = point(node);
            return (
              <g key={node.id} className={`memory-node ${node.status} ${node.current ? 'current' : ''}`}>
                <rect x={p.x - 4} y={p.y - 4} width="8" height="8" />
                {node.current && <circle cx={p.x} cy={p.y} r="8" />}
                {node.name && <text className="place-label" x={p.x + 8} y={p.y - 7}>{node.name}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="direction-meta">{memory.directionCount} directional tendencies exist here.</div>
      <div className="direction-list">
        {memory.directions.map((direction) => (
          <div className="direction" key={direction.key}>
            <span>{direction.shape}</span><b>{direction.label}</b>
          </div>
        ))}
      </div>
    </>
  );
}

export function App() {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [knownConcepts, setKnownConcepts] = useState<string[]>([]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [activeCategory, setActiveCategory] = useState('PERCEPTION');
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const ws = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const append = (texts: string[], kind?: Line['kind']) => setLines((current) => [...current, ...texts.map((text, index) => ({ id: Date.now() + index + Math.random(), text, kind }))].slice(-400));

  async function refreshState() {
    const response = await fetch('/api/me', { credentials: 'include' });
    if (!response.ok) return false;
    const data = await response.json();
    setPlayer(data.player);
    setKnownConcepts(Array.isArray(data.knownConcepts) ? data.knownConcepts.map(String) : []);
    setMemory(data.memory ?? null);
    return true;
  }

  async function devLogin(slot = 1) {
    const response = await fetch(`/api/dev/login/${slot}`, { method: 'POST', credentials: 'include' });
    if (response.ok) { await refreshState(); return; }
    append(['THE SERVER FAILED TO LET YOU IN.'], 'system');
  }

  useEffect(() => { void refreshState(); }, []);
  useEffect(() => {
    if (!player?.id) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${location.host}/ws`);
    ws.current = socket;
    socket.onopen = () => append(['CONNECTED.', '']);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'OUTPUT' && Array.isArray(message.lines)) { append(message.lines.map(String)); void refreshState(); }
      else if (message.text) append([String(message.text)], 'system');
    };
    socket.onclose = () => append(['DISCONNECTED.'], 'system');
    return () => { ws.current = null; socket.close(); };
  }, [player?.id]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [lines]);

  const active = useMemo(() => CATEGORIES.find((category) => category.id === activeCategory) ?? CATEGORIES[0]!, [activeCategory]);
  const discoveredInActive = active.actions.filter((action) => knownConcepts.includes(action));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || ws.current?.readyState !== WebSocket.OPEN) return;
    append([`> ${text}`], 'input');
    ws.current.send(JSON.stringify({ type: 'COMMAND', text }));
    setInput('');
  }

  if (!player) return <main className="shell"><section className="gate"><h1>UNINTENDED</h1><p>No tutorial.<br/>No starter bonus.<br/>No chosen one.</p><p>You wanted to be here.</p><button onClick={() => devLogin(1)}>ENTER</button><small>Development self-test identity</small></section></main>;

  return (
    <main className="shell">
      <div className="game-layout">
        <aside className="side-panel lexicon" aria-label="Discovered actions">
          <header><strong>DISCOVERED</strong><span>actions</span></header>
          <nav className="category-tabs">
            {CATEGORIES.map((category) => {
              const count = category.actions.filter((action) => knownConcepts.includes(action)).length;
              return <button key={category.id} className={category.id === active.id ? 'active' : ''} onClick={() => setActiveCategory(category.id)}><span>{category.label}</span><b>{count}</b></button>;
            })}
          </nav>
          <section className="action-list">
            <h2>{active.label.toUpperCase()}</h2>
            {discoveredInActive.length ? discoveredInActive.map((action) => <div className="action-chip" key={action}>{action}</div>) : <p>None understood.</p>}
            <small>{discoveredInActive.length ? `${discoveredInActive.length} understood.` : 'The category remains annoyingly plausible.'}</small>
          </section>
        </aside>

        <section className="terminal" aria-label="game terminal">
          <header><strong>UNINTENDED</strong><span>{player.name}</span></header>
          <div className="scroll" ref={scrollRef}>
            {lines.length === 0 && <div className="opening">BELLWEATHER<br/><br/>Possibly.<br/><br/></div>}
            {lines.map((line) => <div key={line.id} className={line.kind ?? ''}>{line.text || '\u00a0'}</div>)}
          </div>
          <form onSubmit={submit}><label>&gt;</label><input autoFocus autoComplete="off" spellCheck={false} value={input} onChange={(event) => setInput(event.target.value)} maxLength={240}/></form>
        </section>

        <aside className="side-panel memory" aria-label="Memory field">
          <header><strong>MEMORY FIELD</strong><span>not a map</span></header>
          <MemoryField memory={memory} />
        </aside>
      </div>
    </main>
  );
}
