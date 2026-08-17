import { and, desc, eq, sql } from 'drizzle-orm';
import { DIARY_DISCOVERY_ALIAS } from '@unintended/game-core';
import { db } from './db/index.js';
import { anomalyAliasAttempts, anomalyAliasLedger, anomalyClaimsV2, entities, importantHistory, playerProgress, worldEvents } from './db/schema.js';
import { originForPlayer } from './social.js';

export const DIARY_TEMPLATE_ID='ultra-mythic:diary-of-the-unintended';

export async function recordAliasAttempt(input:{alias:string;templateId:string;playerId:string;lastAction:string;outcome:string;reward?:string|null;discovered?:boolean}){
 await db.transaction(async tx=>{
  await tx.insert(anomalyAliasLedger).values({alias:input.alias,templateId:input.templateId,lastAction:input.lastAction,lastOutcome:input.outcome,lastReward:input.reward??null,lastPlayerId:input.playerId,discoveries:0,uniqueAttempts:0}).onConflictDoUpdate({target:anomalyAliasLedger.alias,set:{lastAction:input.lastAction,lastOutcome:input.outcome,lastReward:input.reward??null,lastPlayerId:input.playerId,updatedAt:new Date()}});
  const first=await tx.insert(anomalyAliasAttempts).values({alias:input.alias,playerId:input.playerId}).onConflictDoNothing().returning({alias:anomalyAliasAttempts.alias});
  const updates:Record<string,unknown>={updatedAt:new Date()};
  if(first.length)updates.uniqueAttempts=sql`${anomalyAliasLedger.uniqueAttempts}+1`;
  if(input.discovered)updates.discoveries=sql`${anomalyAliasLedger.discoveries}+1`;
  if(first.length||input.discovered)await tx.update(anomalyAliasLedger).set(updates).where(eq(anomalyAliasLedger.alias,input.alias));
 });
}

export async function maybeSurfaceDiary(playerId:string,locationId:string){
 const [existing]=await db.select({id:entities.id}).from(entities).where(eq(entities.templateId,DIARY_TEMPLATE_ID)).limit(1);if(existing)return null;
 const [progress]=await db.select().from(playerProgress).where(eq(playerProgress.playerId,playerId));if(!progress||progress.hiddenTier<6||progress.currentRegion==='bellweather')return null;
 const claims=await db.select({id:anomalyClaimsV2.instanceId}).from(anomalyClaimsV2).where(eq(anomalyClaimsV2.playerId,playerId));if(claims.length<7)return null;
 const map=originForPlayer(playerId),id=`${DIARY_TEMPLATE_ID}:${Date.now()}`;
 const [created]=await db.insert(entities).values({id,templateId:DIARY_TEMPLATE_ID,mapId:map.id,name:'Diary of the Unintended',kind:'ITEM',locationId,ownerId:null,portable:true,openable:false,open:false,replenishes:false,data:{ultraMythic:true,alias:DIARY_DISCOVERY_ALIAS}}).onConflictDoNothing().returning({id:entities.id});
 if(!created)return null;
 await db.insert(importantHistory).values({type:'ULTRA_MYTHIC_SURFACED',summary:'Something that should have remained an internal record became physically available.',payload:{itemId:id,mapId:map.id,locationId}});
 return {id,alias:DIARY_DISCOVERY_ALIAS};
}

export async function recordDiaryDiscovery(playerId:string,itemId:string,lastAction:string){
 await recordAliasAttempt({alias:DIARY_DISCOVERY_ALIAS,templateId:DIARY_TEMPLATE_ID,playerId,lastAction,outcome:'ULTRA MYTHIC RETAINED',reward:'Diary of the Unintended',discovered:true});
 await db.insert(worldEvents).values({type:'PLAYER_DISCOVERED_ANOMALY',actorId:playerId,targetId:itemId,payload:{alias:DIARY_DISCOVERY_ALIAS,item:'Diary of the Unintended',ultraMythic:true}});
 await db.insert(importantHistory).values({type:'ULTRA_MYTHIC_DISCOVERED',summary:`${DIARY_DISCOVERY_ALIAS} was unfortunately confirmed.`,payload:{playerId,itemId,alias:DIARY_DISCOVERY_ALIAS}});
}

export async function readDiary(playerId:string,page=1){
 const [held]=await db.select({id:entities.id}).from(entities).where(and(eq(entities.ownerId,playerId),eq(entities.templateId,DIARY_TEMPLATE_ID))).limit(1);if(!held)return null;
 const pageSize=12,safePage=Math.max(1,Math.floor(page)),all=await db.select().from(anomalyAliasLedger).orderBy(desc(anomalyAliasLedger.uniqueAttempts),desc(anomalyAliasLedger.updatedAt));
 const pages=Math.max(1,Math.ceil(all.length/pageSize)),current=Math.min(safePage,pages),rows=all.slice((current-1)*pageSize,current*pageSize);
 const lines=['DIARY OF THE UNINTENDED','','The handwriting updates while you are looking at it. This is rude.','',`ALIASES / PAGE ${current} OF ${pages}`,''];
 if(!rows.length)lines.push('Nothing has gone wrong in a sufficiently documented manner yet.');
 for(const row of rows){lines.push(row.alias,`  unique attempts: ${row.uniqueAttempts} · confirmed: ${row.discoveries}`,`  last action: ${row.lastAction??'unrecorded'}`,`  result: ${row.lastOutcome}${row.lastReward?` · got: ${row.lastReward}`:''}`,'');}
 if(current<pages)lines.push(`READ DIARY PAGE ${current+1}`);
 lines.push('',`Recorded aliases: ${all.length}. The Server denies maintaining this publication.`);
 return lines;
}
