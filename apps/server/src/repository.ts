import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ActorView, EntityView, GameEvent, GameRepository, LocationExitView } from '@unintended/game-core';
import { buildWorld, DEFAULT_WORLD_SEED, detectAnomalyCandidates } from '@unintended/world-data';
import { db } from './db/index.js';
import { anomalyClaimsV2, anomalyOwners, characters, entities, locations, npcState, playerConcepts, worldEvents, importantHistory } from './db/schema.js';
import { getPlayerProgress, recordActionUnderstanding, registerFailure, registerQuestion, registerSemanticProbe } from './progression.js';
import { originForPlayer, relationshipSnapshot } from './social.js';

const worldSeed=Number(process.env.WORLD_SEED??DEFAULT_WORLD_SEED);
const world=buildWorld(worldSeed);
const directionByKey=new Map(world.directions.map(direction=>[direction.key,direction]));
const normalise=(value:string)=>value.trim().toLowerCase().replace(/[?.!,]+$/g,'').replace(/\s+/g,' ');
const cleanDestination=(value:string)=>normalise(value)
  .replace(/^(please\s+)?(go|move|walk|head|travel|proceed|return|jump|leave)\s+/,'')
  .replace(/^(to|toward|towards|through|via)\s+/,'')
  .replace(/^(the|a|an)\s+/,'')
  .trim();
const cleanEntity=(value:string)=>normalise(value).replace(/^(please\s+)?(the|a|an)\s+/,'').trim();

function itemView(item:typeof entities.$inferSelect,held=false):EntityView{
 return {id:item.id,name:item.name,kind:item.kind as EntityView['kind'],locationId:item.locationId??undefined,portable:item.portable,openable:item.openable,open:item.open,held,facts:held?[`${item.name} is in your possession.`,'Possession has made it easier to inspect, not necessarily easier to understand.',...(item.openable?[item.open?'It is open.':'It appears capable of opening.']:[])]:[`${item.name} is here.`,item.portable?'It looks movable.':'It does not look conveniently movable.',...(item.openable?[item.open?'It is open.':'It appears capable of opening.']:[])]};
}

export class PostgresGameRepository implements GameRepository {
 async getActor(id:string):Promise<ActorView>{
  const [character]=await db.select().from(characters).where(eq(characters.id,id));if(!character)throw new Error('Player not found');
  const concepts=await db.select().from(playerConcepts).where(eq(playerConcepts.playerId,id));
  return {id:character.id,name:character.name,locationId:character.locationId,knownConcepts:new Set(concepts.map(row=>row.concept))};
 }
 async getLocationName(id:string){const [location]=await db.select().from(locations).where(eq(locations.id,id));return location?.name??'NOWHERE';}
 async listLocationEntities(locationId:string):Promise<EntityView[]>{
  const legacyItems=await db.select().from(entities).where(and(eq(entities.locationId,locationId),isNull(entities.ownerId),isNull(entities.mapId)));
  const localNpcs=await db.select().from(npcState).where(eq(npcState.locationId,locationId));
  return [...legacyItems.map(item=>itemView(item)),...localNpcs.map(npc=>({id:npc.id,name:npc.name,kind:'NPC' as const,locationId:npc.locationId,facts:[`${npc.name} is here.`,npc.job==='unknown'?`${npc.name}'s occupation is not obvious.`:`${npc.name} appears to work as a ${npc.job}.`]}))];
 }
 async listPlayerLocationEntities(playerId:string):Promise<EntityView[]>{
  const actor=await this.getActor(playerId),mapId=originForPlayer(playerId).id;
  const localItems=await db.select().from(entities).where(and(eq(entities.locationId,actor.locationId),eq(entities.mapId,mapId),isNull(entities.ownerId)));
  const localNpcs=await db.select().from(npcState).where(eq(npcState.locationId,actor.locationId));
  return [...localItems.map(item=>itemView(item)),...localNpcs.map(npc=>({id:npc.id,name:npc.name,kind:'NPC' as const,locationId:npc.locationId,facts:[`${npc.name} is here.`,npc.job==='unknown'?`${npc.name}'s occupation is not obvious.`:`${npc.name} appears to work as a ${npc.job}.`]}))];
 }
 async listAccessibleEntities(playerId:string):Promise<EntityView[]>{
  const local=await this.listPlayerLocationEntities(playerId);const held=await db.select().from(entities).where(eq(entities.ownerId,playerId));
  return [...local,...held.map(item=>itemView(item,true))];
 }
 async listLocationExits(locationId:string):Promise<LocationExitView[]>{
  const [location]=await db.select().from(locations).where(eq(locations.id,locationId));if(!location)return [];
  const result:LocationExitView[]=[];for(const [directionKey,destinationId] of Object.entries(location.exits)){const direction=directionByKey.get(directionKey);if(!direction)continue;const [destination]=await db.select().from(locations).where(eq(locations.id,destinationId));result.push({directionKey,shape:direction.shape,label:direction.label,destinationId,destinationName:destination?.name});}return result;
 }
 async findVisibleEntity(locationId:string,query:string){const q=cleanEntity(query);if(!q)return undefined;const list=await this.listLocationEntities(locationId);return list.find(entity=>normalise(entity.name)===q)||list.find(entity=>normalise(entity.name).includes(q)||q.includes(normalise(entity.name)));}
 async findPlayerVisibleEntity(playerId:string,query:string){const q=cleanEntity(query);if(!q)return undefined;const list=await this.listPlayerLocationEntities(playerId);return list.find(entity=>normalise(entity.name)===q)||list.find(entity=>normalise(entity.name).includes(q)||q.includes(normalise(entity.name)));}
 async findAccessibleEntity(playerId:string,query:string){const q=cleanEntity(query);if(!q)return undefined;const list=await this.listAccessibleEntities(playerId);return list.find(entity=>normalise(entity.name)===q)||list.find(entity=>normalise(entity.name).includes(q)||q.includes(normalise(entity.name)));}
 async getPreviousLocation(playerId:string){
  const rows=await db.select({payload:worldEvents.payload}).from(worldEvents).where(and(eq(worldEvents.actorId,playerId),eq(worldEvents.type,'PLAYER_MOVED'))).orderBy(desc(worldEvents.createdAt)).limit(1);
  const from=(rows[0]?.payload as Record<string,unknown>|undefined)?.from;if(typeof from!=='string')return null;const [location]=await db.select().from(locations).where(eq(locations.id,from));return location?{id:location.id,name:location.name}:null;
 }
 async movePlayer(playerId:string,destination:string){
  const [character]=await db.select().from(characters).where(eq(characters.id,playerId));if(!character)return null;const [location]=await db.select().from(locations).where(eq(locations.id,character.locationId));if(!location)return null;
  const raw=normalise(destination),query=cleanDestination(destination);let targetId:string|undefined,matchedDirection:string|undefined;
  if(['back','backwards','backward','where i came from','previous place'].includes(query)){const previous=await this.getPreviousLocation(playerId);if(previous&&Object.values(location.exits).includes(previous.id))targetId=previous.id;}
  if(!targetId){for(const [directionKey,candidateId] of Object.entries(location.exits)){const direction=directionByKey.get(directionKey);const [target]=await db.select().from(locations).where(eq(locations.id,candidateId));const label=direction?cleanDestination(direction.label):'',shape=direction?.shape??'',destinationName=target?cleanDestination(target.name):'';const matchesDirection=!!direction&&(query===label||raw===normalise(direction.label)||raw===shape||query===normalise(direction.key));const matchesDestination=!!target&&(query===destinationName||destinationName.includes(query)||query.includes(destinationName));if(matchesDirection||matchesDestination){targetId=candidateId;matchedDirection=directionKey;break;}}}
  if(!targetId)return null;const [to]=await db.select().from(locations).where(eq(locations.id,targetId));if(!to)return null;await db.update(characters).set({locationId:to.id}).where(eq(characters.id,playerId));return {from:character.locationId,to:to.id,toName:to.name,directionKey:matchedDirection};
 }
 async takeItem(playerId:string,itemId:string){
  const legacy=await db.select().from(anomalyOwners).where(and(eq(anomalyOwners.playerId,playerId),eq(anomalyOwners.anomalyId,'ownership-after-open')));const claims=await db.select({exception:anomalyClaimsV2.exception}).from(anomalyClaimsV2).where(eq(anomalyClaimsV2.playerId,playerId));const canCarryAwkward=legacy.length>0||claims.some(row=>(row.exception as any)?.primitive==='CARRY_AWKWARD');
  const [item]=await db.select().from(entities).where(eq(entities.id,itemId));if(!item)return false;const mapId=originForPlayer(playerId).id;if(item.mapId&&item.mapId!==mapId)return false;
  const condition=canCarryAwkward?and(eq(entities.id,itemId),isNull(entities.ownerId)):and(eq(entities.id,itemId),isNull(entities.ownerId),eq(entities.portable,true));const [updated]=await db.update(entities).set({ownerId:playerId,locationId:null}).where(condition).returning();if(!updated)return false;
  if(updated.replenishes&&updated.mapId&&updated.templateId){const spawnLocation=(updated.data as Record<string,unknown>)?.spawnLocationId;await db.insert(entities).values({id:`${updated.mapId}:${updated.templateId}:r:${randomUUID()}`,name:updated.name,kind:updated.kind,mapId:updated.mapId,templateId:updated.templateId,locationId:typeof spawnLocation==='string'?spawnLocation:item.locationId,ownerId:null,portable:updated.portable,openable:updated.openable,open:false,replenishes:true,data:{...(updated.data as Record<string,unknown>),replacement:true}});}
  return true;
 }
 async dropItem(playerId:string,itemIdOrName:string){const [character]=await db.select().from(characters).where(eq(characters.id,playerId));if(!character)return null;const owned=await db.select().from(entities).where(eq(entities.ownerId,playerId));const q=cleanEntity(itemIdOrName);const item=owned.find(row=>row.id===itemIdOrName||normalise(row.name)===q||normalise(row.name).includes(q));if(!item)return null;await db.update(entities).set({ownerId:null,locationId:character.locationId,mapId:item.mapId??originForPlayer(playerId).id}).where(eq(entities.id,item.id));return {id:item.id,name:item.name};}
 async openEntity(playerId:string,entityId:string){const mapId=originForPlayer(playerId).id;const [entity]=await db.select().from(entities).where(eq(entities.id,entityId));if(!entity||entity.ownerId!==playerId&&entity.mapId!==mapId)return false;const [updated]=await db.update(entities).set({open:true}).where(and(eq(entities.id,entityId),eq(entities.openable,true),eq(entities.open,false))).returning({id:entities.id});return !!updated;}
 async maintainRelationship(playerId:string,npcId:string){
  const actor=await this.getActor(playerId);const [npc]=await db.select().from(npcState).where(and(eq(npcState.id,npcId),eq(npcState.locationId,actor.locationId)));if(!npc)return null;
  const before=await relationshipSnapshot(playerId,npcId);const task=before?.maintenanceTask??'Help with something routine and mildly inconvenient.';
  await db.insert(worldEvents).values({type:'RELATIONSHIP_MAINTAINED',actorId:playerId,targetId:npcId,locationId:actor.locationId,payload:{task}});
  const after=await relationshipSnapshot(playerId,npcId);if(!after)return null;return {npcId,npcName:npc.name,task,familiarity:after.familiarity,trust:after.trust,level:after.level,established:after.established};
 }
 async discoverConcept(playerId:string,concept:string){const inserted=await db.insert(playerConcepts).values({playerId,concept}).onConflictDoNothing().returning({concept:playerConcepts.concept});return inserted.length===1;}
 async registerSemanticProbe(playerId:string,concept:string,surface:string){const row=await registerSemanticProbe(playerId,concept,surface);return {distinct:row.distinct,hintLevel:row.hintLevel};}
 async registerInquiry(playerId:string,signature:string){return registerQuestion(playerId,signature);}
 async registerFailure(playerId:string,family:string){return registerFailure(playerId,family);}
 async recordUnderstanding(playerId:string,actionId:string,contextKey:string,success:boolean,extras?:{anomaly?:boolean;thresholdGrade?:'BARE'|'COMPETENT'|'MASTERY'}){const update=await recordActionUnderstanding(playerId,actionId,contextKey,success,extras);return {currentTitle:update.currentTitle,hiddenTier:update.hiddenTier,titleChanged:update.titleChanged,tierChanged:update.tierChanged};}
 async recordEvents(events:GameEvent[]){if(events.length)await db.insert(worldEvents).values(events.map(event=>({type:event.type,actorId:event.actorId,targetId:event.targetId,locationId:event.locationId,payload:event.payload??{},createdAt:event.at})));}
 async tryDesignedAnomalies(events:GameEvent[],playerId:string){
  if(!events.length)return {};
  const history=await db.select({type:worldEvents.type,targetId:worldEvents.targetId,locationId:worldEvents.locationId,payload:worldEvents.payload}).from(worldEvents).where(eq(worldEvents.actorId,playerId)).orderBy(desc(worldEvents.createdAt)).limit(6);
  const recent=[...history.reverse().map(row=>({type:row.type,targetId:row.targetId??undefined,locationId:row.locationId??undefined,payload:(row.payload??{}) as Record<string,unknown>})),...events.map(event=>({type:event.type,targetId:event.targetId,locationId:event.locationId,payload:event.payload}))];
  const progress=await getPlayerProgress(playerId);const candidates=detectAnomalyCandidates(worldSeed,recent,progress.hiddenTier).filter(candidate=>candidate.variant%4===0);
  for(const candidate of candidates){const exception={primitive:candidate.template.exception,domain:candidate.template.domain,antiAbuse:candidate.template.antiAbuse,apparentUtility:candidate.template.apparentUtility};const [claimed]=await db.insert(anomalyClaimsV2).values({instanceId:candidate.instanceId,templateId:candidate.template.id,variant:candidate.variant,worldSeed:String(worldSeed),playerId,exception,utility:candidate.template.utility}).onConflictDoNothing().returning({instanceId:anomalyClaimsV2.instanceId});if(!claimed)continue;await db.insert(importantHistory).values({type:'ANOMALY_DISCOVERED',summary:`A ${candidate.template.domain.toLowerCase()} contradiction was retained.`,payload:{instanceId:candidate.instanceId,templateId:candidate.template.id,playerId,exception:candidate.template.exception}});return {claimed:{id:candidate.instanceId,name:candidate.template.name},retained:[candidate.template.exception]};}
  return {};
 }
}
