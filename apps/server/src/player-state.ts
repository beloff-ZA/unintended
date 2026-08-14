import { eq } from 'drizzle-orm';
import { ACTION_CATALOG, ANOMALY_TEMPLATES, buildWorld, DEFAULT_WORLD_SEED } from '@unintended/world-data';
import { db } from './db/index.js';
import { anomalyClaimsV2, characters, entities, playerConcepts, worldEvents } from './db/schema.js';
import { getPlayerProgress } from './progression.js';
import { assessCurrentRegion } from './adventure-progress.js';

const world=buildWorld(Number(process.env.WORLD_SEED??DEFAULT_WORLD_SEED));
const worldLocationById=new Map(world.locations.map(location=>[location.id,location]));
const directionByKey=new Map(world.directions.map(direction=>[direction.key,direction]));
const anomalyById=new Map(ANOMALY_TEMPLATES.map(template=>[template.id,template]));
const actionById=new Map(ACTION_CATALOG.map(action=>[action.id,action]));
const actionCategories=[...new Set(ACTION_CATALOG.map(action=>action.category))];

export async function buildPlayerState(playerId:string){
  const [character]=await db.select().from(characters).where(eq(characters.id,playerId));if(!character)return undefined;
  const concepts=await db.select().from(playerConcepts).where(eq(playerConcepts.playerId,playerId));
  const inventory=await db.select().from(entities).where(eq(entities.ownerId,playerId));
  const history=await db.select({type:worldEvents.type,locationId:worldEvents.locationId,payload:worldEvents.payload}).from(worldEvents).where(eq(worldEvents.actorId,playerId));
  const progress=await getPlayerProgress(playerId);const assessment=await assessCurrentRegion(playerId);
  const claims=await db.select().from(anomalyClaimsV2).where(eq(anomalyClaimsV2.playerId,playerId));

  const visited=new Set<string>([character.locationId]);const observed=new Set<string>();
  const traversed:Array<{from:string;to:string;directionKey?:string}>=[];
  for(const event of history){
    if(event.type==='PLAYER_LOOKED'&&event.locationId){observed.add(event.locationId);visited.add(event.locationId);}
    if(event.type==='PLAYER_MOVED'&&event.locationId){visited.add(event.locationId);const payload=(event.payload??{}) as Record<string,unknown>;const from=typeof payload.from==='string'?payload.from:undefined;if(from){visited.add(from);traversed.push({from,to:event.locationId,directionKey:typeof payload.directionKey==='string'?payload.directionKey:undefined});}}
  }
  const visibleIds=new Set<string>(visited);
  for(const locationId of observed){const location=worldLocationById.get(locationId);if(location)for(const targetId of Object.values(location.exits))visibleIds.add(targetId);}
  const nodes=[...visibleIds].map(id=>worldLocationById.get(id)).filter((location):location is NonNullable<typeof location>=>!!location).map(location=>({id:location.id,name:visited.has(location.id)?location.name:null,x:location.x,y:location.y,status:visited.has(location.id)?'visited':'inferred',current:location.id===character.locationId}));
  const edgeMap=new Map<string,{from:string;to:string;directionKey:string;shape:string;label:string;status:'known'|'inferred'}>();
  for(const step of traversed){if(!step.directionKey)continue;const direction=directionByKey.get(step.directionKey);if(!direction)continue;edgeMap.set(`${step.from}:${step.directionKey}:${step.to}`,{from:step.from,to:step.to,directionKey:step.directionKey,shape:direction.shape,label:direction.label,status:'known'});}
  for(const sourceId of observed){const source=worldLocationById.get(sourceId);if(!source)continue;for(const [directionKey,targetId] of Object.entries(source.exits)){const direction=directionByKey.get(directionKey);if(!direction)continue;const key=`${sourceId}:${directionKey}:${targetId}`;if(!edgeMap.has(key))edgeMap.set(key,{from:sourceId,to:targetId,directionKey,shape:direction.shape,label:direction.label,status:visited.has(targetId)?'known':'inferred'});}}
  const edges=[...edgeMap.values()];const seenDirectionKeys=new Set(edges.map(edge=>edge.directionKey));const directions=world.directions.filter(direction=>seenDirectionKeys.has(direction.key));
  const knownConcepts=concepts.map(row=>row.concept);
  return {
    player:{id:character.id,name:character.name,locationId:character.locationId},knownConcepts,inventory:inventory.map(row=>({id:row.id,name:row.name})),
    actionCategories:[...actionCategories,'INQUIRY'],discoveredActions:knownConcepts.map(id=>id==='INQUIRE'?{id,category:'INQUIRY'}:(actionById.get(id)?{id,category:actionById.get(id)!.category}:undefined)).filter(Boolean),
    progression:{title:progress.currentTitle,currentRegion:progress.currentRegion,assessment:assessment.assessment,goal:assessment.condition,goals:assessment.completedGoals,hint:assessment.hint,rewards:assessment.rewards,nextRegions:assessment.nextRegions},
    anomalies:claims.map(claim=>{const template=anomalyById.get(claim.templateId);return {id:claim.instanceId,name:template?.name??'Retained Exception',domain:template?.domain??'UNKNOWN',apparentUtility:(claim.exception as any)?.apparentUtility??claim.utility};}),
    memory:{rememberedDirectionCount:directions.length,nodes,edges,directions}
  };
}
