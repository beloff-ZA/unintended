import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { buildWorld, DEFAULT_WORLD_SEED } from '@unintended/world-data';
import { db } from './db/index.js';
import { characters, importantHistory, npcState, worldEvents } from './db/schema.js';

export type SocialMap = { id:string; name:string; facet:string; code:string };
export type SocialMapLink = { from:string; to:string; source:'seed'|'world' };
export type RelationshipView = {
  npcId:string;npcName:string;level:string;familiarity:number;trust:number;obligation:number;
  established:boolean;lastInteractionAt:string|null;needsAttention:boolean;maintenanceTask:string|null;
  networkAccess:boolean;networkCooldownMinutes:number|null;
};
export type ActiveRelationshipTask={taskId:string;npcId:string;npcName:string;targetLocationId:string;targetLocationName:string;description:string;startedAt:string};

const seed=Number(process.env.WORLD_SEED??DEFAULT_WORLD_SEED);
const world=buildWorld(seed);
const FACET='Bellweather';
const LEVEL_RANK:Record<string,number>={STRANGER:0,RECOGNISES:1,FAMILIAR:2,KNOWN:3,TRUSTED:4,ENTRENCHED:5};

function hash(value:string){let h=2166136261;for(const char of value){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const codeBase=hash(`${seed}:map-codes`)%800;
function codeFor(index:number){return String(100+((codeBase+index*37)%900)).padStart(3,'0');}

export const SOCIAL_MAPS:SocialMap[]=Array.from({length:24},(_,index)=>{const code=codeFor(index);return {id:`map-${index+1}`,facet:FACET,code,name:`${FACET} ${code}`};});

const SEEDED_LINKS:SocialMapLink[]=SOCIAL_MAPS.flatMap((map,index)=>{
  const clusterStart=Math.floor(index/4)*4,within=index-clusterStart,links:SocialMapLink[]=[];
  if(within<3)links.push({from:map.id,to:SOCIAL_MAPS[index+1]!.id,source:'seed'});
  return links;
});

export function originForPlayer(playerId:string){return SOCIAL_MAPS[hash(`${seed}:origin:${playerId}`)%SOCIAL_MAPS.length]!;}

export async function ensureOriginAssigned(playerId:string){
  const existing=await db.select({id:worldEvents.id}).from(worldEvents).where(and(eq(worldEvents.actorId,playerId),eq(worldEvents.type,'PLAYER_ORIGIN_ASSIGNED'))).limit(1);
  const origin=originForPlayer(playerId);if(existing.length)return {origin,newlyAssigned:false};
  await db.insert(worldEvents).values({type:'PLAYER_ORIGIN_ASSIGNED',actorId:playerId,locationId:null,payload:{mapId:origin.id,mapName:origin.name,facet:origin.facet,code:origin.code}});
  return {origin,newlyAssigned:true};
}

async function worldLinks(){
  const rows=await db.select({payload:worldEvents.payload}).from(worldEvents).where(eq(worldEvents.type,'MAP_LINKED'));
  const dynamic:SocialMapLink[]=[];
  for(const row of rows){const payload=(row.payload??{}) as Record<string,unknown>;if(typeof payload.fromMap==='string'&&typeof payload.toMap==='string')dynamic.push({from:payload.fromMap,to:payload.toMap,source:'world'});}
  const unique=new Map<string,SocialMapLink>();for(const link of [...SEEDED_LINKS,...dynamic]){const key=[link.from,link.to].sort().join(':');if(!unique.has(key))unique.set(key,link);}return [...unique.values()];
}

export async function socialReach(playerId:string){
  const origin=originForPlayer(playerId),links=await worldLinks(),adjacent=new Map<string,Set<string>>();
  for(const map of SOCIAL_MAPS)adjacent.set(map.id,new Set());for(const link of links){adjacent.get(link.from)?.add(link.to);adjacent.get(link.to)?.add(link.from);}
  const reached=new Set<string>([origin.id]),queue=[origin.id];while(queue.length){const current=queue.shift()!;for(const next of adjacent.get(current)??[]){if(reached.has(next))continue;reached.add(next);queue.push(next);}}
  const maps=SOCIAL_MAPS.filter(map=>reached.has(map.id)),visibleLinks=links.filter(link=>reached.has(link.from)&&reached.has(link.to));
  const scope=maps.length<=1?'LOCAL':maps.length<=4?'NEIGHBOURHOOD':maps.length<=12?'REGIONAL':'WIDE';
  return {origin,maps,links:visibleLinks,linkedMapCount:maps.length-1,totalMapCount:SOCIAL_MAPS.length,scope};
}

export async function maybeLinkMapForProgress(playerId:string,regionId:string,grade:string){
  if(!['COMPETENT','MASTERY'].includes(grade))return null;const reach=await socialReach(playerId);if(reach.maps.length>=SOCIAL_MAPS.length)return null;
  const outside=SOCIAL_MAPS.filter(map=>!reach.maps.some(current=>current.id===map.id));if(!outside.length)return null;const target=outside[hash(`${playerId}:${regionId}:${grade}`)%outside.length]!;const pair=[reach.origin.id,target.id].sort();
  const existing=await db.select({id:worldEvents.id}).from(worldEvents).where(and(eq(worldEvents.type,'MAP_LINKED'),sql`((${worldEvents.payload}->>'fromMap' = ${pair[0]} and ${worldEvents.payload}->>'toMap' = ${pair[1]}) or (${worldEvents.payload}->>'fromMap' = ${pair[1]} and ${worldEvents.payload}->>'toMap' = ${pair[0]}))`)).limit(1);if(existing.length)return null;
  await db.insert(worldEvents).values({type:'MAP_LINKED',actorId:playerId,locationId:null,payload:{fromMap:reach.origin.id,toMap:target.id,fromName:reach.origin.name,toName:target.name,regionId,grade}});
  await db.insert(importantHistory).values({type:'MAP_LINKED',summary:`${reach.origin.name} established contact with ${target.name}.`,payload:{fromMap:reach.origin.id,toMap:target.id,regionId,grade}});return {from:reach.origin,to:target};
}

function relationshipLevel(familiarity:number,trust:number,established:boolean){const score=familiarity*.65+trust*.35;if(established&&score>=82)return 'ENTRENCHED';if(score>=64)return 'TRUSTED';if(score>=44)return 'KNOWN';if(score>=24)return 'FAMILIAR';if(score>=8)return 'RECOGNISES';return 'STRANGER';}
function maintenanceTask(playerId:string,npcId:string){const day=Math.floor(Date.now()/86400000),choices=['They have a small errand that requires you to go somewhere else and actually come back.','A routine local fact needs checking. Apparently your legs have been nominated.','They need confirmation from elsewhere in Bellweather. This is beneath heroism and therefore suitable.'];return choices[hash(`${seed}:${playerId}:${npcId}:${day}`)%choices.length]!;}
function networkAccessFor(level:string,globalCapable:boolean){if(level==='ENTRENCHED')return {allowed:true,cooldown:15};if(globalCapable&&LEVEL_RANK[level]>=LEVEL_RANK.TRUSTED)return {allowed:true,cooldown:60};return {allowed:false,cooldown:null};}

export async function relationshipSnapshot(playerId:string,npcId:string):Promise<RelationshipView|null>{
  const [npc]=await db.select().from(npcState).where(eq(npcState.id,npcId));if(!npc)return null;
  const rows=await db.select({type:worldEvents.type,createdAt:worldEvents.createdAt}).from(worldEvents).where(and(eq(worldEvents.actorId,playerId),eq(worldEvents.targetId,npcId),inArray(worldEvents.type,['PLAYER_ASKED_QUESTION','RELATIONSHIP_MAINTAINED']))).orderBy(desc(worldEvents.createdAt));
  const interactions=rows.filter(row=>row.type==='PLAYER_ASKED_QUESTION').length,maintenance=rows.filter(row=>row.type==='RELATIONSHIP_MAINTAINED').length,last=rows[0]?.createdAt??null,ageDays=last?Math.max(0,(Date.now()-last.getTime())/86400000):999;
  const rawFamiliarity=Math.min(100,interactions*9+maintenance*24),rawTrust=Math.min(100,interactions*3+maintenance*18),established=maintenance>=3||rawTrust>=58||rawFamiliarity>=72;
  const familiarityFloor=established?34:0,trustFloor=established?24:0,familiarity=Math.max(familiarityFloor,Math.round(rawFamiliarity-ageDays*(established?0.65:3.8))),trust=Math.max(trustFloor,Math.round(rawTrust-ageDays*(established?0.3:1.2))),obligation=Math.min(100,maintenance*10),level=relationshipLevel(familiarity,trust,established);
  const needsAttention=level!=='ENTRENCHED'&&(ageDays>2||level==='STRANGER'||level==='RECOGNISES'),network=networkAccessFor(level,npc.globalCapable);
  const lastInteractionAt:string|null=last?last.toISOString():null;
  return {npcId,npcName:npc.name,level,familiarity,trust,obligation,established,lastInteractionAt,needsAttention,maintenanceTask:needsAttention?maintenanceTask(playerId,npcId):null,networkAccess:network.allowed,networkCooldownMinutes:network.cooldown};
}

export async function relationshipsForPlayer(playerId:string):Promise<RelationshipView[]>{
  const targets=await db.selectDistinct({targetId:worldEvents.targetId}).from(worldEvents).where(and(eq(worldEvents.actorId,playerId),inArray(worldEvents.type,['PLAYER_ASKED_QUESTION','RELATIONSHIP_MAINTAINED']),sql`${worldEvents.targetId} is not null`));
  const relationships:RelationshipView[]=[];
  for(const row of targets){if(!row.targetId)continue;const relationship=await relationshipSnapshot(playerId,row.targetId);if(relationship)relationships.push(relationship);}
  return relationships;
}

export async function contactNpcNetwork(playerId:string,npcName:string,topic:string){
 const origin=originForPlayer(playerId),[npc]=await db.select().from(npcState).where(and(eq(npcState.mapId,origin.id),sql`lower(${npcState.name}) = lower(${npcName.trim()})`)).limit(1);if(!npc)return {ok:false,reason:'UNKNOWN' as const};
 const relationship=await relationshipSnapshot(playerId,npc.id);if(!relationship?.networkAccess)return {ok:false,reason:'FAMILIARITY' as const,required:npc.globalCapable?'TRUSTED':'ENTRENCHED',level:relationship?.level??'STRANGER'};
 const cooldownMinutes=relationship.networkCooldownMinutes??60,[last]=await db.select({createdAt:worldEvents.createdAt}).from(worldEvents).where(and(eq(worldEvents.actorId,playerId),eq(worldEvents.targetId,npc.id),eq(worldEvents.type,'REMOTE_NPC_CONTACTED'))).orderBy(desc(worldEvents.createdAt)).limit(1);
 if(last?.createdAt){const remaining=Math.ceil((cooldownMinutes*60000-(Date.now()-last.createdAt.getTime()))/60000);if(remaining>0)return {ok:false,reason:'COOLDOWN' as const,remaining};}
 const reach=await socialReach(playerId),cleanTopic=topic.trim().slice(0,120);let response:string;
 if(npc.job==='courier')response=`The Courier checks what the connected routes are saying about ${cleanTopic||'the matter'}. ${reach.maps.length} Maps are currently close enough to be relevant.`;
 else if(npc.job==='clerk')response=`The Clerk accepts a network inquiry about ${cleanTopic||'the record'}. Advice is available remotely; filings, ownership changes, and favours are not.`;
 else response=`${npc.name} answers because your history has become difficult to classify as local. The answer concerns ${cleanTopic||'whatever you apparently considered urgent'}.`;
 await db.insert(worldEvents).values({type:'REMOTE_NPC_CONTACTED',actorId:playerId,targetId:npc.id,locationId:null,payload:{topic:cleanTopic,mapId:origin.id,reachableMaps:reach.maps.length,cooldownMinutes}});
 return {ok:true,npc,relationship,response,cooldownMinutes};
}

export async function activeRelationshipTask(playerId:string,npcId?:string):Promise<ActiveRelationshipTask|null>{
 const starts=await db.select({targetId:worldEvents.targetId,payload:worldEvents.payload,createdAt:worldEvents.createdAt}).from(worldEvents).where(and(eq(worldEvents.actorId,playerId),eq(worldEvents.type,'RELATIONSHIP_TASK_STARTED'))).orderBy(desc(worldEvents.createdAt)).limit(20);
 const completes=await db.select({payload:worldEvents.payload}).from(worldEvents).where(and(eq(worldEvents.actorId,playerId),eq(worldEvents.type,'RELATIONSHIP_TASK_COMPLETED'))).orderBy(desc(worldEvents.createdAt)).limit(50);const completed=new Set(completes.map(row=>(row.payload as Record<string,unknown>)?.taskId).filter((value):value is string=>typeof value==='string'));
 for(const row of starts){if(!row.targetId||npcId&&row.targetId!==npcId)continue;const payload=(row.payload??{}) as Record<string,unknown>,taskId=payload.taskId;if(typeof taskId!=='string'||completed.has(taskId))continue;const [npc]=await db.select().from(npcState).where(eq(npcState.id,row.targetId));if(!npc)continue;return {taskId,npcId:row.targetId,npcName:npc.name,targetLocationId:String(payload.targetLocationId??''),targetLocationName:String(payload.targetLocationName??''),description:String(payload.description??'Check something elsewhere and return.'),startedAt:row.createdAt.toISOString()};}
 return null;
}

export async function startRelationshipTask(playerId:string,npcId:string):Promise<ActiveRelationshipTask|null>{
 const existing=await activeRelationshipTask(playerId,npcId);if(existing)return existing;const mapId=originForPlayer(playerId).id,[character]=await db.select().from(characters).where(eq(characters.id,playerId)),[npc]=await db.select().from(npcState).where(and(eq(npcState.id,npcId),eq(npcState.mapId,mapId)));if(!character||!npc||character.locationId!==npc.locationId)return null;
 const candidates=world.locations.filter(location=>location.id!==npc.locationId);if(!candidates.length)return null;const target=candidates[hash(`${seed}:${playerId}:${npcId}:${Date.now()>>18}`)%candidates.length]!,taskId=`favour:${playerId}:${npcId}:${Date.now()}`;const description=`Go to ${target.name}, LOOK there, then return to ${npc.name} and report back.`;
 await db.insert(worldEvents).values({type:'RELATIONSHIP_TASK_STARTED',actorId:playerId,targetId:npcId,locationId:character.locationId,payload:{taskId,targetLocationId:target.id,targetLocationName:target.name,description,mapId}});return {taskId,npcId,npcName:npc.name,targetLocationId:target.id,targetLocationName:target.name,description,startedAt:new Date().toISOString()};
}

export async function completeRelationshipTask(playerId:string,npcId:string){
 const task=await activeRelationshipTask(playerId,npcId);if(!task)return {ok:false,reason:'NONE' as const};const mapId=originForPlayer(playerId).id,[character]=await db.select().from(characters).where(eq(characters.id,playerId)),[npc]=await db.select().from(npcState).where(and(eq(npcState.id,npcId),eq(npcState.mapId,mapId)));if(!character||!npc||character.locationId!==npc.locationId)return {ok:false,reason:'NPC_NOT_HERE' as const};
 const observed=await db.select({id:worldEvents.id}).from(worldEvents).where(and(eq(worldEvents.actorId,playerId),eq(worldEvents.type,'PLAYER_LOOKED'),eq(worldEvents.locationId,task.targetLocationId),sql`${worldEvents.createdAt} >= ${new Date(task.startedAt)}`)).limit(1);if(!observed.length)return {ok:false,reason:'NOT_DONE' as const,task};
 await db.insert(worldEvents).values([{type:'RELATIONSHIP_TASK_COMPLETED',actorId:playerId,targetId:npcId,locationId:character.locationId,payload:{taskId:task.taskId,mapId}},{type:'RELATIONSHIP_MAINTAINED',actorId:playerId,targetId:npcId,locationId:character.locationId,payload:{taskId:task.taskId,task:task.description,mapId}}]);const relationship=await relationshipSnapshot(playerId,npcId);return {ok:true,task,relationship};
}

export async function returnRecap(playerId:string,relationships:RelationshipView[]){
  const [last]=await db.select({createdAt:worldEvents.createdAt}).from(worldEvents).where(and(eq(worldEvents.actorId,playerId),sql`${worldEvents.type} <> 'PLAYER_ORIGIN_ASSIGNED'`)).orderBy(desc(worldEvents.createdAt)).limit(1);if(!last?.createdAt)return [] as string[];
  const absentMs=Date.now()-last.createdAt.getTime();if(absentMs<2*60*60*1000)return [];const hours=Math.floor(absentMs/3600000),history=await db.select().from(importantHistory).where(sql`${importantHistory.createdAt} > ${last.createdAt}`).orderBy(desc(importantHistory.createdAt)).limit(3),lines=[`You were absent for approximately ${hours} hour${hours===1?'':'s'}.`];
  for(const item of history.reverse())lines.push(item.summary);const cooled=relationships.filter(row=>row.needsAttention&&row.lastInteractionAt).slice(0,2);for(const row of cooled)lines.push(`${row.npcName} has had time to become less certain about your continued relevance.`);if(lines.length===1)lines.push('Nothing sufficiently important happened. This is probably temporary.');return lines;
}
