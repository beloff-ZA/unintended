import { db,pool } from './db/index.js'; import { anomalies, entities, locations, npcState, projects, worldDoors, worldFlags } from './db/schema.js'; import { ANOMALIES, ITEMS, LOCATIONS, NPCS, PROJECTS, WORLD_DOORS } from '@unintended/world-data';
await db.insert(locations).values(LOCATIONS.map(x=>({...x,exits:{...x.exits}}))).onConflictDoNothing();
await db.insert(entities).values(ITEMS.map(x=>({...x,kind:'ITEM'}))).onConflictDoNothing();
await db.insert(npcState).values(NPCS.map(x=>({...x,memory:[],data:{}}))).onConflictDoNothing();
await db.insert(anomalies).values(ANOMALIES.map(x=>({id:x.id,name:'name' in x?x.name:undefined,domain:x.domain,doorKey:'doorKey' in x?x.doorKey:undefined,pattern:[...x.pattern]}))).onConflictDoNothing();
await db.insert(worldDoors).values(WORLD_DOORS.map(x=>({key:x.key,name:x.name,open:x.initiallyOpen}))).onConflictDoNothing();
await db.insert(projects).values(PROJECTS.map(x=>({id:x.id,name:x.name,requirements:x.requirements,progress:{}}))).onConflictDoNothing();
await db.insert(worldFlags).values({key:'weather',value:{kind:'clear',until:null}}).onConflictDoNothing();console.log('World seeded.');await pool.end();
