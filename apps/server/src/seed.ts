import { db,pool } from './db/index.js';
import { anomalies, entities, locations, npcState, projects, worldDoors, worldFlags } from './db/schema.js';
import { ANOMALIES, ITEMS, NPCS, PROJECTS, WORLD_DOORS, buildWorld, DEFAULT_WORLD_SEED } from '@unintended/world-data';
import { SOCIAL_MAPS } from './social.js';

const seed=Number(process.env.WORLD_SEED??DEFAULT_WORLD_SEED);
const world=buildWorld(seed);
const replenishableNames=new Set(['ledger','letter','receipt']);
for(const location of world.locations){
 await db.insert(locations).values({id:location.id,name:location.name,exits:{...location.exits}}).onConflictDoUpdate({target:locations.id,set:{name:location.name,exits:{...location.exits}}});
}
for(const map of SOCIAL_MAPS){
 const rows=ITEMS.map(item=>({
  id:`${map.id}:${item.id}`,
  templateId:item.id,
  mapId:map.id,
  name:item.name,
  kind:'ITEM',
  locationId:item.locationId,
  ownerId:null,
  portable:item.portable,
  openable:item.openable,
  open:false,
  replenishes:replenishableNames.has(item.name.toLowerCase()),
  data:{originMapId:map.id,spawnLocationId:item.locationId,templateId:item.id}
 }));
 await db.insert(entities).values(rows).onConflictDoNothing();
}
await db.insert(npcState).values(NPCS.map(x=>({...x,memory:[],data:{}}))).onConflictDoNothing();
await db.insert(anomalies).values(ANOMALIES.map(x=>({id:x.id,name:'name' in x?x.name:undefined,domain:x.domain,doorKey:'doorKey' in x?x.doorKey:undefined,pattern:[...x.pattern]}))).onConflictDoNothing();
await db.insert(worldDoors).values(WORLD_DOORS.map(x=>({key:x.key,name:x.name,open:x.initiallyOpen}))).onConflictDoNothing();
await db.insert(projects).values(PROJECTS.map(x=>({id:x.id,name:x.name,requirements:x.requirements,progress:{}}))).onConflictDoNothing();
await db.insert(worldFlags).values({key:'weather',value:{kind:'clear',until:null}}).onConflictDoNothing();
await db.insert(worldFlags).values({key:'world-seed',value:{seed:world.seed,directionCount:world.directions.length,directions:world.directions}}).onConflictDoUpdate({target:worldFlags.key,set:{value:{seed:world.seed,directionCount:world.directions.length,directions:world.directions}}});
console.log(`World seeded with ${world.directions.length} directional tendencies across ${SOCIAL_MAPS.length} origin maps.`);await pool.end();
