import { useEffect, useMemo, useRef, useState } from 'react';

type Item={id:string;name:string;portable?:boolean;openable?:boolean;open?:boolean};
type Npc={id:string;name:string;job?:string};
type Exit={key:string;label:string;shape:string;targetId:string;targetName:string};
type WorldState={seed:number;location:{id:string;name:string;x:number;y:number};exits:Exit[];nearby:{npcs:Npc[];items:Item[]}};
type WorldEvent={id:string;type:string;targetId:string|null;locationId:string|null;payload:Record<string,unknown>;createdAt:string};
type Line={id:number;text:string;kind?:'system'|'input'|'social'};
type Tab='THREADS'|'PEOPLE'|'MAP'|'MEMORY';

const COMMANDS={
  PERCEPTION:['look'],
  MOVEMENT:['go'],
  HANDLING:['take','drop','open'],
  KNOWLEDGE:['inventory'],
} as const;

function playerId(){let id=localStorage.getItem('unintended-player-id');if(!id){id=`web-${crypto.randomUUID()}`;localStorage.setItem('unintended-player-id',id);}return id;}
function label(value:string){return value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}

export function HostedApp(){
  const [id]=useState(playerId),[state,setState]=useState<WorldState|null>(null),[inventory,setInventory]=useState<Item[]>([]),[events,setEvents]=useState<WorldEvent[]>([]),[lines,setLines]=useState<Line[]>([]),[input,setInput]=useState(''),[tab,setTab]=useState<Tab>('THREADS'),[category,setCategory]=useState<keyof typeof COMMANDS>('PERCEPTION'),[connected,setConnected]=useState(false);
  const scrollRef=useRef<HTMLDivElement>(null),inputRef=useRef<HTMLInputElement>(null),counter=useRef(0),socket=useRef<WebSocket|null>(null);
  const headers={'x-player-id':id};
  const append=(texts:string[],kind?:Line['kind'])=>setLines(current=>[...current,...texts.map((text,i)=>({id:Date.now()+i+Math.random(),text,kind}))].slice(-500));

  async function refresh(){
    const [worldRes,invRes,eventRes]=await Promise.all([
      fetch('/world',{headers}),fetch('/inventory',{headers}),fetch('/events?limit=30',{headers}),
    ]);
    if(worldRes.ok){const data=await worldRes.json();setState(data as WorldState);}
    if(invRes.ok){const data=await invRes.json();setInventory(Array.isArray(data.inventory)?data.inventory:[]);}
    if(eventRes.ok){const data=await eventRes.json();setEvents(Array.isArray(data.events)?data.events:[]);}
  }

  async function run(command:string){
    const text=command.trim();if(!text)return;
    append([`> ${text}`],'input');setInput('');
    const response=await fetch('/command',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({type:'COMMAND',text,requestId:`web-${Date.now()}-${++counter.current}`})});
    const data=await response.json();
    append(Array.isArray(data.lines)?data.lines.map(String):[String(data.message??data.code??'The Server produced no useful sentence.')],response.ok?undefined:'system');
    if(data.state)setState(data.state as WorldState);
    await refresh();
  }

  useEffect(()=>{void refresh().then(()=>append(['CONNECTED.',''],'system')).catch(()=>append(['THE HOSTED WORLD FAILED TO REPORT FOR DUTY.'],'system'));},[]);
  useEffect(()=>{const proto=location.protocol==='https:'?'wss':'ws';const ws=new WebSocket(`${proto}://${location.host}/ws?player=${encodeURIComponent(id)}`);socket.current=ws;ws.onopen=()=>setConnected(true);ws.onclose=()=>setConnected(false);ws.onmessage=event=>{try{const message=JSON.parse(event.data);if(message.type==='PRESENCE'&&message.text)append([String(message.text)],'social');}catch{}};return()=>ws.close();},[id]);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[lines]);

  const threadEvents=useMemo(()=>events.filter(event=>['ITEM_TAKEN','ITEM_DROPPED','ITEM_OPENED','PLAYER_MOVED'].includes(event.type)).slice(0,7),[events]);
  const actionCount=Object.values(COMMANDS).reduce((sum,list)=>sum+list.length,0);
  const useCommand=(command:string)=>{setInput(command);requestAnimationFrame(()=>inputRef.current?.focus());};
  const tabs:Tab[]=['THREADS','PEOPLE','MAP','MEMORY'];

  return <main className="shell"><div className="game-layout">
    <aside className="side-panel lexicon"><header><strong>UNDERSTANDING</strong><span>{actionCount} known</span></header>
      <nav className="category-tabs">{(Object.keys(COMMANDS) as Array<keyof typeof COMMANDS>).map(key=><button key={key} className={category===key?'active':''} onClick={()=>setCategory(key)}><span>{label(key)}</span><b>{COMMANDS[key].length}</b></button>)}</nav>
      <section className="action-list"><h2>{category}</h2>{COMMANDS[category].map(action=><button className="action-chip" key={action} onClick={()=>useCommand(action)}>{action.toUpperCase()}</button>)}<small>{COMMANDS[category].length} understood.</small></section>
      {inventory.length>0&&<section className="action-list"><h2>INVENTORY</h2>{inventory.map(item=><button className="action-chip" key={item.id} onClick={()=>useCommand(`drop ${item.name}`)}>{item.name}</button>)}</section>}
    </aside>

    <section className="terminal"><header><div><strong>UNINTENDED</strong><small>{state?.location.name??'Bellweather'}</small></div><span className="identity"><b>Unidentified Participant</b><small>{connected?'Locally Relevant':'Potentially Correct'}</small></span></header>
      {state&&<div className="objective-strip"><div><span>CURRENT MATTER</span><b>{state.location.name}</b></div><p>The hosted world now remembers what you move, take, drop and open.</p><strong className="assessment strong">LIVE</strong></div>}
      <div className="scroll" ref={scrollRef}>{lines.length===0&&<div className="opening">BELLWEATHER<br/><br/>The same world, now inconveniently hosted elsewhere.<br/><br/>Look around. Move. Take something. The database is keeping receipts.</div>}{lines.map(line=><div key={line.id} className={line.kind??''}>{line.text||'\u00a0'}</div>)}</div>
      <form onSubmit={e=>{e.preventDefault();void run(input);}}><label>&gt;</label><input ref={inputRef} autoFocus autoComplete="off" spellCheck={false} value={input} onChange={e=>setInput(e.target.value)} placeholder="Tell the world what you intend." maxLength={240}/></form>
    </section>

    <aside className="side-panel world-panel"><header><strong>CONTEXT</strong><span>{threadEvents.length} unresolved</span></header><nav className="world-tabs">{tabs.map(value=><button key={value} className={tab===value?'active':''} onClick={()=>setTab(value)}>{value}{value==='THREADS'&&threadEvents.length?<b>{threadEvents.length}</b>:null}</button>)}</nav>
      <section className="world-content">
        {tab==='THREADS'&&<div className="thread-panel"><div className="thread-list">{threadEvents.length?threadEvents.map(event=><div className="thread open" key={event.id}><span>◇</span><div><b>{label(event.type)}</b><small>{event.locationId??'The record declines to name a place.'}</small></div></div>):<div className="empty-state compact">Nothing unresolved is currently admitting it.</div>}</div></div>}
        {tab==='PEOPLE'&&<div className="relationship-list">{state?.nearby.npcs.length?state.nearby.npcs.map(npc=><div className="relationship" key={npc.id}><div><b>{npc.name}</b><span>{npc.job?label(npc.job):'Nearby'}</span></div><small>Currently present in {state.location.name}.</small></div>):<div className="empty-state">Nobody nearby appears professionally relevant.</div>}</div>}
        {tab==='MAP'&&<div><div className="social-summary"><b>{state?.location.name??'Unknown'}</b><span>{state?.exits.length??0} KNOWN WAYS</span></div><div className="direction-list">{state?.exits.map(exit=><button className="direction" key={exit.key} onClick={()=>void run(`go ${exit.label}`)}><span>{exit.shape}</span><b>{exit.label}</b></button>)}</div></div>}
        {tab==='MEMORY'&&<div className="thread-list">{events.length?events.slice(0,12).map(event=><div className="thread watching" key={event.id}><span>·</span><div><b>{label(event.type)}</b><small>{new Date(event.createdAt).toLocaleString()}</small></div></div>):<div className="empty-state">The record is currently suspiciously clean.</div>}</div>}
      </section>
    </aside>
  </div></main>;
}
