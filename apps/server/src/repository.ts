import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ActorView, EntityView, GameEvent, GameRepository } from '@unintended/game-core';
import { buildWorld, DEFAULT_WORLD_SEED, detectAnomalyCandidates } from '@unintended/world-data';
import { db } from './db/index.js';
import { anomalyClaimsV2, anomalyOwners, characters, entities, locations, npcState, playerConcepts, worldEvents, importantHistory } from './db/schema.js';
import { getPlayerProgress, recordActionUnderstanding, registerQuestion, registerSemanticProbe } from './progression.js';

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
  const query=normalise(destination).replace(/^(the|a|an)\s+/,''); let targetId:string|undefined; let matchedDirection:string|undefined;
  for(const [directionKey,candidateId] of Object.entries(l.exits)){
   const direction=directionByKey.get(directionKey); const [target]=await db.select().from(locations).where(eq(locations.id,candidateId));
   const matchesDirection=direction && (query===normalise(direction.label)||destination.trim()===direction.shape||query===normalise(direction.key));
   const matchesDestination=target && (normalise(target.name)===query||normalise(target.name).includes(query));
   if(matchesDirection||matchesDestination){targetId=candidateId;matchedDirection=directionKey;break;}
  }
  if(!targetId) return null;
  const [to]=await db.select().from(locations).where(eq(locations.id,targetId)); if(!to) return null;
  await db.update(characters).set({locationId:to.id}).where(eq(characters.id,playerId)); return {from:c.locationId,to:to.id,toName:to.name,directionKey:matchedDirection};
 }
 async takeItem(playerId:string,itemId:string){
  const legacy=await db.select().from(anomalyOwners).where(and(eq(anomalyOwners.playerId,playerId),eq(anomalyOwners.anomalyId,'ownership-after-open')));
  const claims=await db.select({exception:anomalyClaimsV2.exception}).from(anomalyClaimsV2).where(eq(anomalyClaimsV2.playerId,playerId));
  const canCarryAwkward=legacy.length>0||claims.some(row=>(row.exception as any)?.primitive==='CARRY_AWKWARD');
  const condition=canCarryAwkward?and(eq(entities.id,itemId),isNull(entities.ownerId)):and(eq(entities.id,itemId),isNull(entities.ownerId),eq(entities.portable,true));
  const [updated]=await db.update(entities).set({ownerId:playerId,locationId:null}).where(condition).returning({id:entities.id}); return !!updated;
 }
 async dropItem(playerId:string,itemIdOrName:string){
  const [c]=await db.select().from(characters).where(eq(characters.id,playerId)); if(!c) return null;
  const owned=await db.select().from(entities).where(eq(entities.ownerId,playerId)); const q=normalise(itemIdOrName); const item=owned.find(x=>x.id===itemIdOrName||normalise(x.name).includes(q)); if(!item) return null;
  await db.update(entities).set({ownerId:null,locationId:c.locationId}).where(eq(entities.id,item.id)); return {id:item.id,name:item.name};
 }
 async openEntity(_playerId:string,entityId:string){const [u]=await db.update(entities).set({open:true}).where(and(eq(entities.id,entityId),eq(entities.openable,true),eq(entities.open,false))).returning({id:entities.id}); return !!u;}
 async discoverConcept(playerId:string,concept:string){
  const inserted=await db.insert(playerConcepts).values({playerId,concept}).onConflictDoNothing().returning({concept:playerConcepts.concept}); return inserted.length===1;
 }
 async registerSemanticProbe(playerId:string,concept:string,surface:string){const row=await registerSemanticProbe(playerId,concept,surface);return {distinct:row.distinct,hintLevel:row.hintLevel};}
 async registerInquiry(playerId:string,signature:string){return registerQuestion(playerId,signature);}
 async recordUnderstanding(playerId:string,actionId:string,contextKey:string,success:boolean,extras?:{anomaly?:boolean;thresholdGrade?:'BARE'|'COMPETENT'|'MASTERY'}){
  const update=await recordActionUnderstanding(playerId,actionId,contextKey,success,extras);return {currentTitle:update.currentTitle,hiddenTier:update.hiddenTier,titleChanged:update.titleChanged,tierChanged:update.tierChanged};
 }
 async recordEvents(events:GameEvent[]){ if(!events.length) return; await db.insert(worldEvents).values(events.map(e=>({type:e.type,actorId:e.actorId,targetId:e.targetId,locationId:e.locationId,payload:e.payload??{},createdAt:e.at}))); }
 async tryDesignedAnomalies(events:GameEvent[],playerId:string){
  if(!events.length)return {};
  const history=await db.select({type:worldEvents.type,targetId:worldEvents.targetId,locationId:worldEvents.locationId,payload:worldEvents.payload}).from(worldEvents).where(eq(worldEvents.actorId,playerId)).orderBy(desc(worldEvents.createdAt)).limit(6);
  const recent=[...history.reverse().map(row=>({type:row.type,targetId:row.targetId??undefined,locationId:row.locationId??undefined,payload:(row.payload??{}) as Record<string,unknown>})),...events.map(event=>({type:event.type,targetId:event.targetId,locationId:event.locationId,payload:event.payload}))];
  const progress=await getPlayerProgress(playerId);const candidates=detectAnomalyCandidates(worldSeed,recent,progress.hiddenTier).filter(candidate=>candidate.variant%4===0);
  for(const candidate of candidates){
   const exception={primitive:candidate.template.exception,domain:candidate.template.domain,antiAbuse:candidate.template.antiAbuse,apparentUtility:candidate.template.apparentUtility};
   const [claimed]=await db.insert(anomalyClaimsV2).values({instanceId:candidate.instanceId,templateId:candidate.template.id,variant:candidate.variant,worldSeed:String(worldSeed),playerId,exception,utility:candidate.template.utility}).onConflictDoNothing().returning({instanceId:anomalyClaimsV2.instanceId});
   if(!claimed)continue;
   await db.insert(importantHistory).values({type:'ANOMALY_DISCOVERED',summary:`A ${candidate.template.domain.toLowerCase()} contradiction was retained.`,payload:{instanceId:candidate.instanceId,templateId:candidate.template.id,playerId,exception:candidate.template.exception}});
   return {claimed:{id:candidate.instanceId,name:candidate.template.name},retained:[candidate.template.exception]};
  }
  return {};
 }
}
