import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ActorView, EntityView, GameEvent, GameRepository } from '@unintended/game-core';
import { buildWorld, DEFAULT_WORLD_SEED } from '@unintended/world-data';
import { db } from './db/index.js';
import { anomalies, anomalyOwners, characters, entities, locations, npcState, playerConcepts, worldDoors, worldEvents, importantHistory } from './db/schema.js';

const worldSeed = Number(process.env.WORLD_SEED ?? DEFAULT_WORLD_SEED);
const world = buildWorld(worldSeed);
const directionByKey = new Map(world.directions.map((direction) => [direction.key, direction]));
const normalise = (value:string) => value.trim().toLowerCase().replace(/[?.!,]+$/g,'').replace(/\s+/g,' ');

export class PostgresGameRepository implements GameRepository {
 async getActor(id:string):Promise<ActorView>{
  const [c]=await db.select().from(characters).where(eq(characters.id,id)); if(!c) throw new Error('Player not found');
  const concepts=await db.select().from(playerConcepts).where(eq(playerConcepts.playerId,id));
  return {id:c.id,name:c.name,locationId:c.locationId,knownConcepts:new Set(concepts.map(x=>x.concept))};
 }
 async getLocationName(id:string){const [l]=await db.select().from(locations).where(eq(locations.id,id)); return l?.name??'NOWHERE';}
 async listLocationEntities(locationId:string):Promise<EntityView[]>{
  const es=await db.select().from(entities).where(and(eq(entities.locationId,locationId),isNull(entities.ownerId)));
  const ns=await db.select().from(npcState).where(eq(npcState.locationId,locationId));
  return [
   ...es.map(e=>({id:e.id,name:e.name,kind:e.kind as EntityView['kind'],locationId:e.locationId??undefined,portable:e.portable,openable:e.openable,open:e.open,facts:[`${e.name} is here.`,e.portable?'It looks movable.':'It does not look conveniently movable.',...(e.openable?[e.open?'It is open.':'It appears capable of opening.']:[])]})),
   ...ns.map(n=>({id:n.id,name:n.name,kind:'NPC' as const,locationId:n.locationId,facts:[`${n.name} is here.`,n.job==='unknown'?`${n.name}'s occupation is not obvious.`:`${n.name} appears to work as a ${n.job}.`]}))
  ];
 }
 async findVisibleEntity(locationId:string, query:string){
  const q=normalise(query).replace(/^(the|a|an)\s+/,''); if(!q) return undefined; const es=await this.listLocationEntities(locationId);
  return es.find(e=>normalise(e.name)===q)||es.find(e=>normalise(e.name).includes(q)||q.includes(normalise(e.name)));
 }
 async movePlayer(playerId:string,destination:string){
  const [c]=await db.select().from(characters).where(eq(characters.id,playerId)); if(!c) return null;
  const [l]=await db.select().from(locations).where(eq(locations.id,c.locationId)); if(!l) return null;
  const query=normalise(destination).replace(/^(the|a|an)\s+/,''); let targetId:string|undefined;
  for(const [directionKey,candidateId] of Object.entries(l.exits)){
   const direction=directionByKey.get(directionKey); const [target]=await db.select().from(locations).where(eq(locations.id,candidateId));
   const matchesDirection=direction && (query===normalise(direction.label)||destination.trim()===direction.shape||query===normalise(direction.key));
   const matchesDestination=target && (normalise(target.name)===query||normalise(target.name).includes(query));
   if(matchesDirection||matchesDestination){targetId=candidateId;break;}
  }
  if(!targetId) return null;
  const [to]=await db.select().from(locations).where(eq(locations.id,targetId)); if(!to) return null;
  await db.update(characters).set({locationId:to.id}).where(eq(characters.id,playerId)); return {from:c.locationId,to:to.id,toName:to.name};
 }
 async takeItem(playerId:string,itemId:string){
  const ownedException=await db.select().from(anomalyOwners).where(and(eq(anomalyOwners.playerId,playerId),eq(anomalyOwners.anomalyId,'ownership-after-open')));
  const condition=ownedException.length ? and(eq(entities.id,itemId),isNull(entities.ownerId)) : and(eq(entities.id,itemId),isNull(entities.ownerId),eq(entities.portable,true));
  const [updated]=await db.update(entities).set({ownerId:playerId,locationId:null}).where(condition).returning({id:entities.id}); return !!updated;
 }
 async dropItem(playerId:string,itemIdOrName:string){
  const [c]=await db.select().from(characters).where(eq(characters.id,playerId)); if(!c) return false;
  const owned=await db.select().from(entities).where(eq(entities.ownerId,playerId)); const q=normalise(itemIdOrName); const item=owned.find(x=>x.id===itemIdOrName||normalise(x.name).includes(q)); if(!item) return false;
  await db.update(entities).set({ownerId:null,locationId:c.locationId}).where(eq(entities.id,item.id)); return true;
 }
 async openEntity(_playerId:string,entityId:string){const [u]=await db.update(entities).set({open:true}).where(and(eq(entities.id,entityId),eq(entities.openable,true),eq(entities.open,false))).returning({id:entities.id}); return !!u;}
 async discoverConcept(playerId:string,concept:string){
  const inserted=await db.insert(playerConcepts).values({playerId,concept}).onConflictDoNothing().returning({concept:playerConcepts.concept}); return inserted.length===1;
 }
 async recordEvents(events:GameEvent[]){ if(!events.length) return; await db.insert(worldEvents).values(events.map(e=>({type:e.type,actorId:e.actorId,targetId:e.targetId,locationId:e.locationId,payload:e.payload??{},createdAt:e.at}))); }
 async tryDesignedAnomalies(events:GameEvent[],playerId:string){
  if(!events.length) return {};
  const history=await db.select({type:worldEvents.type}).from(worldEvents).where(eq(worldEvents.actorId,playerId)).orderBy(desc(worldEvents.createdAt)).limit(8);
  const recent=[...history.reverse().map(e=>e.type),...events.map(e=>e.type)];
  const candidates=await db.select().from(anomalies).where(isNull(anomalies.discoveredBy));
  const hit=candidates.find(a=>{const pattern=a.pattern as string[]; if(pattern.length>recent.length)return false; const tail=recent.slice(-pattern.length); return pattern.every((p,i)=>tail[i]===p);}); if(!hit) return {};
  return await db.transaction(async tx=>{
   const [claimed]=await tx.update(anomalies).set({discoveredBy:playerId,discoveredAt:new Date()}).where(and(eq(anomalies.id,hit.id),isNull(anomalies.discoveredBy))).returning();
   if(!claimed) return {};
   await tx.insert(anomalyOwners).values({anomalyId:claimed.id,playerId});
   if(claimed.doorKey){ await tx.update(worldDoors).set({open:true,openedAt:new Date(),openedByAnomaly:claimed.id}).where(eq(worldDoors.key,claimed.doorKey)); }
   await tx.insert(importantHistory).values({type:'ANOMALY_DISCOVERED',summary:`An anomaly in ${claimed.domain} was claimed.`,payload:{anomalyId:claimed.id,playerId}});
   return {claimed:{id:claimed.id,name:claimed.name??undefined,doorKey:claimed.doorKey??undefined}};
  });
 }
}
