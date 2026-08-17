import { eq } from 'drizzle-orm';
import { ACTION_CATALOG, ANOMALY_TEMPLATES, buildWorld, DEFAULT_WORLD_SEED } from '@unintended/world-data';
import { db } from './db/index.js';
import { anomalyClaimsV2, characters, entities, playerConcepts, worldEvents } from './db/schema.js';
import { getPlayerProgress } from './progression.js';
import { assessCurrentRegion } from './adventure-progress.js';
import { relationshipsForPlayer, returnRecap, socialReach } from './social.js';

const world=buildWorld(Number(process.env.WORLD_SEED??DEFAULT_WORLD_SEED));
const worldLocationById=new Map(world.locations.map(location=>[location.id,location]));
const directionByKey=new Map(world.directions.map(direction=>[direction.key,direction]));
const anomalyById=new Map(ANOMALY_TEMPLATES.map(template=>[template.id,template]));
const actionById=new Map(ACTION_CATALOG.map(action=>[action.id,action]));
const actionCategories=[...new Set(ACTION_CATALOG.map(action=>action.category))];

type Thread={id:string;title:string;detail:string;state:'OPEN'|'WATCHING'|'COOLING';};
type AssistedAction={label:string;command:string;reason:string};

function buildThreads(currentRegion:string,goals:Array<{id:string;complete:boolean;progress:number;target:number}>,concepts:Set<string>,inventoryNames:string[],relationships:Awaited<ReturnType<typeof relationshipsForPlayer>>,reach:Awaited<ReturnType<typeof socialReach>>):Thread[]{
  const threads:Thread[]=[];const contradiction=goals.find(goal=>goal.id.endsWith(':contradiction'));
  if(currentRegion==='bellweather'&&!contradiction?.complete)threads.push({id:'bellweather-discrepancy',title:'The Registry Discrepancy',detail:'Possession and recorded ownership disagree. Find enough evidence that the Registry can no longer pretend this is formatting.',state:'OPEN'});
  if(inventoryNames.some(name=>name.toLowerCase().includes('letter')))threads.push({id:'letter-elsewhere',title:'The Letter Is Elsewhere',detail:concepts.has('READ')?'The letter claims its bearer has it while the Registry records it elsewhere. Someone should be made to explain that.':'You possess a letter connected to the Registry. Reading it would be less decorative than carrying it.',state:'OPEN'});
  const cooling=relationships.find(row=>row.needsAttention&&row.lastInteractionAt);if(cooling)threads.push({id:`relationship:${cooling.npcId}`,title:`${cooling.npcName} Is Becoming Less Certain`,detail:cooling.maintenanceTask??'A small ordinary interaction would remind them that this relationship still exists.',state:'COOLING'});
  if(reach.maps.length<reach.totalMapCount)threads.push({id:'social-horizon',title:'Beyond Your Origin Map',detail:`${reach.maps.length} of ${reach.totalMapCount} known Maps are socially reachable from ${reach.origin.name}. Strong regional progress can establish new contact.`,state:'WATCHING'});
  return threads.slice(0,5);
}

function starterAssistance(locationId:string,concepts:Set<string>,inventoryNames:string[]):AssistedAction[]{
 const result:AssistedAction[]=[{label:'Observe',command:'Look around',reason:'Establish what is actually here before accusing reality of anything.'}];
 const inventoryLower=inventoryNames.map(name=>name.toLowerCase()),hasLetter=inventoryLower.some(name=>name.includes('letter')),hasLedger=inventoryLower.some(name=>name.includes('ledger'));
 if(locationId==='bellweather-square')result.push({label:'Question someone',command:'Ask Courier about Registry',reason:'People occasionally know why the paperwork is wrong. They rarely volunteer this.'});
 if(locationId==='registry-steps'){
  if(!hasLetter)result.push({label:'Handle evidence',command:'Take letter',reason:'Some contradictions are easier to inspect when they are physically your problem.'});
  if(hasLetter&&!concepts.has('READ'))result.push({label:'Inspect evidence',command:'Read letter',reason:'Written evidence is traditionally more useful after reading.'});
  if((hasLetter||hasLedger)&&concepts.has('READ')&&!concepts.has('CLAIM'))result.push({label:'Test ownership',command:`Claim ${hasLetter?'letter':'ledger'}`,reason:'Bellweather distinguishes possession from ownership. Test the distinction.'});
  result.push({label:'Question the record',command:'Ask Clerk about ownership',reason:'The Registry employs someone whose job makes this their problem.'});
 }
 if(locationId==='bakery')result.push({label:'Question locally',command:'Ask Baker about Registry',reason:'Ordinary people experience administrative nonsense differently from administrators.'});
 if(locationId==='market-lane')result.push({label:'Question locally',command:'Ask Farmer about ownership',reason:'Trade and possession tend to make ownership less theoretical.'});
 const location=worldLocationById.get(locationId);if(location){const first=Object.keys(location.exits)[0],direction=first?directionByKey.get(first):undefined;if(direction)result.push({label:'Travel',command:`Move ${direction.label}`,reason:'Routes are part of the evidence. Their names are intentionally unhelpful, not unusable.'});}
 if(inventoryNames.length)result.push({label:'Check possessions',command:'Inventory',reason:'The Server can list what it currently accepts you are carrying.'});
 return [...new Map(result.map(item=>[item.command.toLowerCase(),item])).values()].slice(0,5);
}

export async function buildPlayerState(playerId:string){
  const [character]=await db.select().from(characters).where(eq(characters.id,playerId));if(!character)return undefined;
  const concepts=await db.select().from(playerConcepts).where(eq(playerConcepts.playerId,playerId));
  const inventory=await db.select().from(entities).where(eq(entities.ownerId,playerId));
  const history=await db.select({type:worldEvents.type,locationId:worldEvents.locationId,payload:worldEvents.payload}).from(worldEvents).where(eq(worldEvents.actorId,playerId));
  const progress=await getPlayerProgress(playerId),assessment=await assessCurrentRegion(playerId);
  const claims=await db.select().from(anomalyClaimsV2).where(eq(anomalyClaimsV2.playerId,playerId));
  const relationships=await relationshipsForPlayer(playerId),social=await socialReach(playerId),recap=await returnRecap(playerId,relationships);

  const visited=new Set<string>([character.locationId]),observed=new Set<string>();const traversed:Array<{from:string;to:string;directionKey?:string}>=[];
  for(const event of history){
    if(event.type==='PLAYER_LOOKED'&&event.locationId){observed.add(event.locationId);visited.add(event.locationId);}
    if(event.type==='PLAYER_MOVED'&&event.locationId){visited.add(event.locationId);const payload=(event.payload??{}) as Record<string,unknown>;const from=typeof payload.from==='string'?payload.from:undefined;if(from){visited.add(from);traversed.push({from,to:event.locationId,directionKey:typeof payload.directionKey==='string'?payload.directionKey:undefined});}}
  }
  const visibleIds=new Set<string>(visited);for(const locationId of observed){const location=worldLocationById.get(locationId);if(location)for(const targetId of Object.values(location.exits))visibleIds.add(targetId);}
  const nodes=[...visibleIds].map(id=>worldLocationById.get(id)).filter((location):location is NonNullable<typeof location>=>!!location).map(location=>({id:location.id,name:visited.has(location.id)?location.name:null,x:location.x,y:location.y,status:visited.has(location.id)?'visited':'inferred',current:location.id===character.locationId}));
  const edgeMap=new Map<string,{from:string;to:string;directionKey:string;shape:string;label:string;status:'known'|'inferred'}>();
  for(const step of traversed){if(!step.directionKey)continue;const direction=directionByKey.get(step.directionKey);if(!direction)continue;edgeMap.set(`${step.from}:${step.directionKey}:${step.to}`,{from:step.from,to:step.to,directionKey:step.directionKey,shape:direction.shape,label:direction.label,status:'known'});}
  for(const sourceId of observed){const source=worldLocationById.get(sourceId);if(!source)continue;for(const [directionKey,targetId] of Object.entries(source.exits)){const direction=directionByKey.get(directionKey);if(!direction)continue;const key=`${sourceId}:${directionKey}:${targetId}`;if(!edgeMap.has(key))edgeMap.set(key,{from:sourceId,to:targetId,directionKey,shape:direction.shape,label:direction.label,status:visited.has(targetId)?'known':'inferred'});}}
  const edges=[...edgeMap.values()],seenDirectionKeys=new Set(edges.map(edge=>edge.directionKey)),directions=world.directions.filter(direction=>seenDirectionKeys.has(direction.key));
  const knownConcepts=concepts.map(row=>row.concept),conceptSet=new Set(knownConcepts),inventoryNames=inventory.map(row=>row.name);
  const threads=buildThreads(progress.currentRegion,assessment.completedGoals,conceptSet,inventoryNames,relationships,social);
  const assistanceActive=progress.currentRegion==='bellweather'&&assessment.grade==='FAIL';
  return {
    player:{id:character.id,name:character.name,locationId:character.locationId},knownConcepts,inventory:inventory.map(row=>({id:row.id,name:row.name})),
    actionCategories:[...actionCategories,'INQUIRY'],discoveredActions:knownConcepts.map(id=>id==='INQUIRE'?{id,category:'INQUIRY'}:(actionById.get(id)?{id,category:actionById.get(id)!.category}:undefined)).filter(Boolean),
    progression:{title:progress.currentTitle,currentRegion:progress.currentRegion,assessment:assessment.assessment,grade:assessment.grade,goal:assessment.condition,goals:assessment.completedGoals,hint:assessment.hint,rewards:assessment.rewards,nextRegions:assessment.nextRegions},
    assistance:{active:assistanceActive,title:'TEMPORARY ASSISTANCE',note:'These are examples of intentions, not the command list. Assistance is withdrawn after first proficiency.',suggestions:assistanceActive?starterAssistance(character.locationId,conceptSet,inventoryNames):[]},
    anomalies:claims.map(claim=>{const template=anomalyById.get(claim.templateId);return {id:claim.instanceId,name:template?.name??'Retained Exception',domain:template?.domain??'UNKNOWN',apparentUtility:(claim.exception as any)?.apparentUtility??claim.utility};}),
    memory:{rememberedDirectionCount:directions.length,nodes,edges,directions},
    social:{...social,assignmentLines:['ORIGIN ASSIGNED',social.origin.name,'This is now considered where you are from.','No appeal process has been discovered.']},
    relationships,threads,returnRecap:recap
  };
}
