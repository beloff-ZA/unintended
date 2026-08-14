export * from './actions.js';
export * from './progression.js';
export * from './anomalies-v2.js';
export * from './adventure.js';

export type DirectionDefinition = {
  key: string;
  shape: string;
  label: string;
};

export type WorldLocation = {
  id: string;
  name: string;
  x: number;
  y: number;
  exits: Record<string, string>;
};

export const DEFAULT_WORLD_SEED = 78219472;

const DIRECTION_LABELS = [
  'This Way',
  'That Way',
  'Other Way',
  'No Way',
  'His Way',
  'Norway',
  'Anyway',
  'Wrong Way',
  'Broadway',
  'Some Way',
  'Your Way',
  'The Long Way',
  'Over There',
  'Not That Way',
  'Probably',
  'Regrettably',
  'A Way',
  'Way Out',
] as const;

const DIRECTION_SHAPES = ['▲', '◆', '●', '■', '⬢', '✦', '✕', '◈', '⬟'] as const;
const ABSURD_LABELS = new Set(['Norway', 'Anyway', 'Broadway']);

const BASE_LOCATIONS = [
  { id: 'bellweather-square', name: 'Bellweather Square', x: 0, y: 0 },
  { id: 'bakery', name: 'The Bakery', x: -2, y: -1 },
  { id: 'registry-steps', name: 'Registry Steps', x: 2, y: -1 },
  { id: 'market-lane', name: 'Market Lane', x: 0, y: 2 },
  { id: 'old-bridge', name: 'The Old Bridge', x: 2, y: 3 },
] as const;

const BASE_EDGES = [
  ['bellweather-square', 'bakery'],
  ['bellweather-square', 'registry-steps'],
  ['bellweather-square', 'market-lane'],
  ['bakery', 'bellweather-square'],
  ['registry-steps', 'bellweather-square'],
  ['market-lane', 'bellweather-square'],
  ['market-lane', 'old-bridge'],
  ['old-bridge', 'market-lane'],
] as const;

function normaliseSeed(value: number | string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value) || DEFAULT_WORLD_SEED;
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function transformPoint(x: number, y: number, variant: number): [number, number] {
  switch (variant % 8) {
    case 1: return [-y, x];
    case 2: return [-x, -y];
    case 3: return [y, -x];
    case 4: return [-x, y];
    case 5: return [x, -y];
    case 6: return [y, x];
    case 7: return [-y, -x];
    default: return [x, y];
  }
}

export function buildWorld(seedInput: number | string = DEFAULT_WORLD_SEED) {
  const seed = normaliseSeed(seedInput);
  const random = mulberry32(seed ^ 0x51f15e);
  const directionCount = 3 + (Math.abs(seed) % 7);
  const labels = shuffled(DIRECTION_LABELS, random).slice(0, directionCount);
  const shapes = shuffled(DIRECTION_SHAPES, random).slice(0, directionCount);

  if (directionCount >= 5 && !labels.some((label) => ABSURD_LABELS.has(label))) {
    labels[labels.length - 1] = 'Norway';
  }

  const directions: DirectionDefinition[] = labels.map((label, index) => ({
    key: `way-${index + 1}`,
    shape: shapes[index]!,
    label,
  }));

  const variant = Math.abs(seed) % 8;
  const locations: WorldLocation[] = BASE_LOCATIONS.map((location) => {
    const [x, y] = transformPoint(location.x, location.y, variant);
    return { id: location.id, name: location.name, x, y, exits: {} };
  });
  const byId = new Map(locations.map((location) => [location.id, location]));
  const usedBySource = new Map<string, Set<string>>();

  for (const [sourceId, targetId] of BASE_EDGES) {
    const source = byId.get(sourceId)!;
    const used = usedBySource.get(sourceId) ?? new Set<string>();
    const available = shuffled(directions, random).filter((direction) => !used.has(direction.key));
    const direction = available[0] ?? directions[Math.floor(random() * directions.length)]!;
    source.exits[direction.key] = targetId;
    used.add(direction.key);
    usedBySource.set(sourceId, used);
  }

  return { seed, directions, locations };
}

export const LOCATIONS = buildWorld(DEFAULT_WORLD_SEED).locations.map(({ id, name, exits }) => ({ id, name, exits }));

export const NPCS = [
  {id:'npc-baker',name:'Baker',locationId:'bakery',job:'baker'},
  {id:'npc-farmer',name:'Farmer',locationId:'market-lane',job:'farmer'},
  {id:'npc-courier',name:'Courier',locationId:'bellweather-square',job:'courier'},
  {id:'npc-clerk',name:'Clerk',locationId:'registry-steps',job:'clerk'},
  {id:'npc-stranger',name:'Strange Person',locationId:'old-bridge',job:'unknown'}
] as const;

export const ITEMS = Array.from({length:20},(_,i)=>({
 id:`item-${i+1}`,
 name:['brass key','apple','loaf of bread','grain sack','ledger','wooden box','iron nail','raincoat','coin','letter','spade','rope','empty bottle','train token','old map','wet stone','receipt','hammer','sign','candle'][i]!,
 locationId:['bellweather-square','market-lane','bakery','market-lane','registry-steps','bakery','old-bridge','bellweather-square','market-lane','registry-steps','market-lane','old-bridge','bakery','bellweather-square','old-bridge','old-bridge','bakery','market-lane','registry-steps','bakery'][i]!,
 portable:i!==18, openable:i===5
}));

export const CONCEPTS=['LOOK','MOVE','TAKE','DROP','OPEN','GIVE','BUY','SELL','READ','HELP','INQUIRE'] as const;
export const ANOMALIES=[
 {id:'ownership-after-open',domain:'OWNERSHIP',doorKey:'registry',name:'Deferred Possession',pattern:['ITEM_TAKEN','DOOR_OPENED']},
 {id:'bridge-return',domain:'SPACE',pattern:['PLAYER_MOVED','PLAYER_MOVED']},
 {id:'bread-ledger',domain:'KNOWLEDGE',pattern:['ITEM_TAKEN','PLAYER_LOOKED']},
 {id:'wet-key',domain:'MATTER',pattern:['ITEM_TAKEN','SERVER_EVENT_TRIGGERED']},
 {id:'courier-gap',domain:'CAUSALITY',pattern:['ITEM_DROPPED','PLAYER_MOVED']}
] as const;
export const WORLD_DOORS=[{key:'registry',name:'Registry Office',initiallyOpen:false,unlocksConcepts:['SIGN','OWE','PROMISE']}] as const;
export const PROJECTS=[{id:'repair-bridge',name:'Repair the Old Bridge',requirements:{wood:10,metal:5,labour:20}}] as const;
