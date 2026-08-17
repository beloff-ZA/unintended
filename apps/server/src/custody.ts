import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db/index.js';
import { anomalyClaimsV2, characters, entities, importantHistory, playerProgress, worldEvents } from './db/schema.js';
import { originForPlayer } from './social.js';

export type CustodyClass='OPEN'|'CONTROLLED'|'CONTESTED'|'BOUND';
export type TransferMode='GIVE'|'LEND'|'TRADE'|'STEAL';

type EntityRow=typeof entities.$inferSelect;

const DIARY='ultra-mythic:diary-of-the-unintended';
const DEFAULT_LOAN_HOURS=24;

function dataOf(item:EntityRow){return (item.data??{}) as Record<string,unknown>;}
export function custodyClassFor(item:EntityRow):CustodyClass{
 const explicit=dataOf(item).custodyClass;
 if(explicit==='OPEN'||explicit==='CONTROLLED'||explicit==='CONTESTED'||explicit==='BOUND')return explicit;
 if(item.templateId===DIARY)return 'CONTESTED';
 if(dataOf(item).ultraMythic===true)return 'CONTESTED';
 if(dataOf(item).bound===true)return 'BOUND';
 if(dataOf(item).hunted===true)return 'CONTROLLED';
 return 'OPEN';
}

async function progressFor(playerId:string){const [row]=await db.select().from(playerProgress).where(eq(playerProgress.playerId,playerId));return row??null;}
async function anomalyCount(playerId:string){const rows=await db.select({id:anomalyClaimsV2.instanceId}).from(anomalyClaimsV2).where(eq(anomalyClaimsV2.playerId,playerId));return rows.length;}
async function samePlace(a:string,b:string){const rows=await db.select().from(characters).where(inArray(characters.id,[a,b]));if(rows.length!==2)return false;return rows[0]!.locationId===rows[1]!.locationId&&originForPlayer(a).id===originForPlayer(b).id;}

async function eligible(input:{mode:TransferMode;item:EntityRow;from:string;to:string}){
 const cls=custodyClassFor(input.item);if(cls==='BOUND')return {ok:false,reason:'BOUND'} as const;
 if(!await samePlace(input.from,input.to))return {ok:false,reason:'DISTANCE'} as const;
 const [fromProgress,toProgress,fromAnomalies,toAnomalies]=await Promise.all([progressFor(input.from),progressFor(input.to),anomalyCount(input.from),anomalyCount(input.to)]);
 const fromTier=fromProgress?.hiddenTier??0,toTier=toProgress?.hiddenTier??0;
 if(cls==='OPEN')return {ok:true,cls} as const;
 if(cls==='CONTROLLED'){
  if(input.mode==='GIVE'||input.mode==='LEND')return {ok:toTier>=1,reason:toTier>=1?undefined:'RESISTS',cls} as const;
  if(input.mode==='TRADE')return {ok:fromTier>=2&&toTier>=2,reason:'RESISTS',cls} as const;
  return {ok:fromTier>=3&&fromAnomalies>=2&&toTier>=2,reason:'RESISTS',cls} as const;
 }
 // CONTESTED. These are deliberately asymmetric. The unfairer the change, the more history must already exist.
 if(input.mode==='GIVE')return {ok:fromTier>=4&&toTier>=4&&toAnomalies>=3,reason:'RESISTS',cls} as const;
 if(input.mode==='LEND')return {ok:fromTier>=4&&toTier>=3&&toAnomalies>=2,reason:'RESISTS',cls} as const;
 if(input.mode==='TRADE')return {ok:fromTier>=5&&toTier>=5&&fromAnomalies>=4&&toAnomalies>=4,reason:'RESISTS',cls} as const;
 const ownerHistory=await db.select({id:worldEvents.id}).from(worldEvents).where(and(eq(worldEvents.actorId,input.to),eq(worldEvents.targetId,input.item.id))).limit(3);
 return {ok:fromTier>=6&&fromAnomalies>=7&&toTier>=4&&ownerHistory.length>=1,reason:'RESISTS',cls} as const;
}

async function itemOwnedBy(playerId:string,itemText:string){const rows=await db.select().from(entities).where(eq(entities.ownerId,playerId));const q=itemText.trim().toLowerCase();return rows.find(row=>row.name.toLowerCase()===q)||rows.find(row=>row.name.toLowerCase().includes(q));}
export async function resolvePlayerAtSamePlace(actorId:string,name:string){const [actor]=await db.select().from(characters).where(eq(characters.id,actorId));if(!actor)return null;const rows=await db.select().from(characters).where(eq(characters.locationId,actor.locationId));const q=name.trim().toLowerCase();return rows.find(row=>row.id!==actorId&&originForPlayer(row.id).id===originForPlayer(actorId).id&&row.name.toLowerCase()===q)??rows.find(row=>row.id!==actorId&&originForPlayer(row.id).id===originForPlayer(actorId).id&&row.name.toLowerCase().includes(q))??null;}

async function recordChange(mode:TransferMode,item:EntityRow,from:string,to:string){
 await db.insert(worldEvents).values({type:'ITEM_TRANSFERRED',actorId:from,targetId:item.id,locationId:null,payload:{mode,fromPlayerId:from,toPlayerId:to,custodyClass:custodyClassFor(item)}});
 if(custodyClassFor(item)!=='OPEN')await db.insert(importantHistory).values({type:'ARTIFACT_CUSTODY_CHANGED',summary:`Custody of ${item.name} changed by ${mode.toLowerCase()}.`,payload:{itemId:item.id,itemName:item.name,mode,fromPlayerId:from,toPlayerId:to}});
}

export async function giveItem(from:string,to:string,itemText:string,mode:'GIVE'|'LEND'='GIVE'){
 const item=await itemOwnedBy(from,itemText);if(!item)return {ok:false,reason:'NOT_HELD' as const};const allowed=await eligible({mode,item,from,to});if(!allowed.ok)return {ok:false,reason:allowed.reason??'RESISTS',item,cls:custodyClassFor(item)};
 const extra=mode==='LEND'?{loanedFrom:from,loanedTo:to,loanDueAt:new Date(Date.now()+DEFAULT_LOAN_HOURS*3600000).toISOString()}:{};
 const [moved]=await db.update(entities).set({ownerId:to,locationId:null,updatedAt:new Date(),data:{...dataOf(item),...extra}}).where(and(eq(entities.id,item.id),eq(entities.ownerId,from))).returning();if(!moved)return {ok:false,reason:'CHANGED' as const};await recordChange(mode,item,from,to);return {ok:true,item:moved,cls:custodyClassFor(item)};
}

export async function stealItem(thief:string,victim:string,itemText:string){const item=await itemOwnedBy(victim,itemText);if(!item)return {ok:false,reason:'NOT_FOUND' as const};const allowed=await eligible({mode:'STEAL',item,from:thief,to:victim});if(!allowed.ok)return {ok:false,reason:allowed.reason??'RESISTS',item,cls:custodyClassFor(item)};const [moved]=await db.update(entities).set({ownerId:thief,locationId:null,updatedAt:new Date(),data:{...dataOf(item),stolenFrom:victim,stolenAt:new Date().toISOString()}}).where(and(eq(entities.id,item.id),eq(entities.ownerId,victim))).returning();if(!moved)return {ok:false,reason:'CHANGED' as const};await recordChange('STEAL',item,victim,thief);return {ok:true,item:moved,cls:custodyClassFor(item)};}

export async function tradeItems(a:string,b:string,aItemText:string,bItemText:string){const [aItem,bItem]=await Promise.all([itemOwnedBy(a,aItemText),itemOwnedBy(b,bItemText)]);if(!aItem||!bItem)return {ok:false,reason:'MISSING' as const};const [aOk,bOk]=await Promise.all([eligible({mode:'TRADE',item:aItem,from:a,to:b}),eligible({mode:'TRADE',item:bItem,from:b,to:a})]);if(!aOk.ok||!bOk.ok)return {ok:false,reason:'RESISTS' as const};const result=await db.transaction(async tx=>{const [one]=await tx.update(entities).set({ownerId:b,updatedAt:new Date()}).where(and(eq(entities.id,aItem.id),eq(entities.ownerId,a))).returning();const [two]=await tx.update(entities).set({ownerId:a,updatedAt:new Date()}).where(and(eq(entities.id,bItem.id),eq(entities.ownerId,b))).returning();if(!one||!two)throw new Error('Trade changed during exchange');return {one,two};});await recordChange('TRADE',aItem,a,b);await recordChange('TRADE',bItem,b,a);return {ok:true,...result};}

export async function returnExpiredLoans(){const now=Date.now(),rows=await db.select().from(entities);let returned=0;for(const item of rows){const data=dataOf(item),due=typeof data.loanDueAt==='string'?Date.parse(data.loanDueAt):NaN,from=typeof data.loanedFrom==='string'?data.loanedFrom:null;if(!from||!Number.isFinite(due)||due>now)continue;const cleaned={...data};delete cleaned.loanDueAt;delete cleaned.loanedFrom;delete cleaned.loanedTo;await db.update(entities).set({ownerId:from,updatedAt:new Date(),data:cleaned}).where(eq(entities.id,item.id));returned+=1;}return returned;}
