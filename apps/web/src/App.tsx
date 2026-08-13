import { useEffect, useRef, useState } from 'react';

type Line = {
  id: number;
  text: string;
  kind?: 'system' | 'input';
};

export function App() {
  const [player, setPlayer] = useState<any>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const ws = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const append = (texts: string[], kind?: Line['kind']) =>
    setLines((current) =>
      [
        ...current,
        ...texts.map((text, index) => ({
          id: Date.now() + index + Math.random(),
          text,
          kind,
        })),
      ].slice(-400),
    );

  async function refresh() {
    const response = await fetch('/api/me', { credentials: 'include' });
    if (response.ok) {
      setPlayer((await response.json()).player);
    }
  }

  async function devLogin(slot = 1) {
    const response = await fetch(`/api/dev/login/${slot}`, {
      method: 'POST',
      credentials: 'include',
    });

    if (response.ok) {
      setPlayer((await response.json()).player);
      return;
    }

    append(['THE SERVER FAILED TO LET YOU IN.'], 'system');
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!player) return;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${location.host}/ws`);
    ws.current = socket;

    socket.onopen = () => append(['CONNECTED.', '']);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'OUTPUT' && Array.isArray(message.lines)) {
        append(message.lines.map(String));
      } else if (message.text) {
        append([String(message.text)], 'system');
      }
    };
    socket.onclose = () => append(['DISCONNECTED.'], 'system');

    return () => {
      ws.current = null;
      socket.close();
    };
  }, [player]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth',
    });
  }, [lines]);

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const text = input.trim();
    if (!text || ws.current?.readyState !== WebSocket.OPEN) return;

    append([`> ${text}`], 'input');
    ws.current.send(JSON.stringify({ type: 'COMMAND', text }));
    setInput('');
  }

  if (!player) {
    return (
      <main className="shell">
        <section className="gate">
          <h1>UNINTENDED</h1>
          <p>
            No tutorial.
            <br />
            No starter bonus.
            <br />
            No chosen one.
          </p>
          <p>You wanted to be here.</p>
          <button onClick={() => devLogin(1)}>ENTER</button>
          <small>Development self-test identity</small>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="terminal" aria-label="game terminal">
        <header>
          <strong>UNINTENDED</strong>
          <span>{player.name}</span>
        </header>

        <div className="scroll" ref={scrollRef}>
          {lines.length === 0 && (
            <div className="opening">
              BELLWEATHER
              <br />
              <br />
              Possibly.
              <br />
              <br />
            </div>
          )}

          {lines.map((line) => (
            <div key={line.id} className={line.kind ?? ''}>
              {line.text || '\u00a0'}
            </div>
          ))}
        </div>

        <form onSubmit={submit}>
          <label>&gt;</label>
          <input
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={240}
          />
        </form>
      </section>
    </main>
  );
}
