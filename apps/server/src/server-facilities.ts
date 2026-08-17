import { desc, eq, inArray } from 'drizzle-orm';
import { incidentAlias } from '@unintended/game-core';
import { db } from './db/index.js';
import { characters, importantHistory, playerProgress, serverEventUsage, worldEvents, worldFlags } from './db/schema.js';
import { originForPlayer } from './social.js';
import { recordAliasAttempt } from './diary.js';

const SAFE_FACILITIES=new Set(['STATUS','LOG','BELL','BIRDS','LIGHTS','WIND','MOON','SUN','WEATHER','DOORS','TIME','HELP']);

export function parseServerCommand(text:string){
 const match=text.trim().match(/^(?:request\s+)?server(?:\s+facility)?\s+([a-z]+)(?:\s+(.+))?$/i);if(!match)return null;
 const facility=match[1]!.toUpperCase();if(!SAFE_FACILITIES.has(facility))return {facility:'UNKNOWN',arg:match[2]?.trim()??''};
 return {facility,arg:match[2]?.trim()??''};
}

export async function runServerFacility(playerId:string,facility:string,arg=''){
 const [character]=await db.select().from(characters).where(eq(characters.id,playerId));if(!character)return ['SERVER FACILITY','Identity not sufficiently present.'];
 const [progress]=await db.select().from(playerProgress).where(eq(playerProgress.playerId,playerId));const tier=progress?.hiddenTier??0,map=originForPlayer(playerId),day=Math.floor(Date.now()/86400000),alias=incidentAlias({event:`server-${facility.toLowerCase()}`,location:character.locationId,item:map.id,day});
 let outcome='REFUSED',reward:string|null=null,lines:string[]=[];
 if(facility==='STATUS'){
  outcome='READ ONLY';reward='Curated diagnostics';lines=['SERVER STATUS',`Map integrity: ${tier>=3?'questionable':'acceptable'}`,`Administrative confidence: ${Math.max(3,82-tier*7)}%`,`Pending contradictions: ${Math.max(1,tier+2)}`,'Actual infrastructure details: withheld for once sensible reasons.'];
 }else if(facility==='LOG'){
  const rows=await db.select().from(serverEventUsage).orderBy(desc(serverEventUsage.createdAt)).limit(5);outcome='READ ONLY';reward='Recent incident aliases';lines=['SERVER LOG / SANITISED','',...(rows.length?rows.map(row=>`${row.incidentAlias} · ${row.event}`):['No incidents have admitted responsibility yet.'])];
  if(tier>=4){const artifactRows=await db.select().from(importantHistory).where(inArray(importantHistory.type,['HUNTED_ARTIFACT_SURFACED','ARTIFACT_CUSTODY_CHANGED','ULTRA_MYTHIC_SURFACED','ULTRA_MYTHIC_DISCOVERED'])).orderBy(desc(importantHistory.createdAt)).limit(2);if(artifactRows.length){lines.push('','RESTRICTED PROPERTY TRACES');for(const row of artifactRows){const payload=(row.payload??{}) as Record<string,unknown>,item=typeof payload.itemName==='string'?payload.itemName:typeof payload.templateId==='string'?'classified artifact':'unclassified object';lines.push(`${item} · ${row.type.replace(/_/g,' ').toLowerCase()}`);}lines.push('Location and current custodian withheld. Apparently one department still understands discretion.');}}
 }else if(facility==='HELP'){
  outcome='UNHELPFUL';reward='A technically valid clue';lines=['SERVER FACILITIES','STATUS and LOG appear to be read-only.','Some environmental requests are processed locally.','DOORS and TIME have legal representation.'];
 }else if(['BELL','BIRDS'].includes(facility)){
  outcome='LOCAL EFFECT';reward=facility==='BELL'?'One locally relevant bell':'Brief local bird nonsense';lines=[`${facility} REQUEST ACCEPTED`,`Scope: ${map.name}.`,`Incident alias: ${alias}.`];
 }else if(['LIGHTS','WIND'].includes(facility)&&tier>=2){
  outcome='LOCAL EFFECT';reward=`Temporary ${facility.toLowerCase()} condition`;lines=[`${facility} REQUEST ACCEPTED`,`The effect remains confined to ${map.name}.`,`Incident alias: ${alias}.`];
 }else if(['MOON','SUN'].includes(facility)&&tier>=3){
  outcome='COSMETIC EFFECT';reward=`Temporary ${facility.toLowerCase()} visibility`;lines=[`${facility} REQUEST ACCEPTED`,'Astronomical authority has been approximated rather than granted.',`Incident alias: ${alias}.`];
 }else if(facility==='WEATHER'&&tier>=5){
  outcome='MAP WEATHER';reward='Three minutes of suspicious weather';await db.insert(worldFlags).values({key:`map:${map.id}:weather`,value:{kind:arg.toLowerCase().includes('clear')?'clear':'rain',until:new Date(Date.now()+3*60_000).toISOString(),actorId:playerId}}).onConflictDoUpdate({target:worldFlags.key,set:{value:{kind:arg.toLowerCase().includes('clear')?'clear':'rain',until:new Date(Date.now()+3*60_000).toISOString(),actorId:playerId}}});lines=['WEATHER REQUEST ACCEPTED',`Scope: ${map.name}. Duration: approximately three minutes.`,`Incident alias: ${alias}.`];
 }else if(['DOORS','TIME'].includes(facility)){
  lines=[`${facility} REQUEST DENIED`,facility==='TIME'?'World time is negotiable. Infrastructure time is not.':'Opening arbitrary doors would undermine several departments and most of the game.',`Incident alias: ${alias}.`];
 }else if(facility==='UNKNOWN'){
  lines=['SERVER FACILITY','That facility either does not exist or has successfully denied existing.'];
 }else{
  lines=[`${facility} REQUEST REVIEWED`,'Your current level of suspicious competence is insufficient for this facility.',`Incident alias: ${alias}.`];
 }
 if(facility!=='UNKNOWN'){
  await db.insert(serverEventUsage).values({event:`server-${facility.toLowerCase()}`,incidentAlias:alias,actorId:playerId});
  await db.insert(worldEvents).values({type:'SERVER_EVENT_TRIGGERED',actorId:playerId,locationId:character.locationId,payload:{facility,arg:arg.slice(0,80),incidentAlias:alias,scope:map.id,outcome}});
  await recordAliasAttempt({alias,templateId:`SERVER:${facility}`,playerId,lastAction:`SERVER ${facility}${arg?` ${arg}`:''}`,outcome,reward});
 }
 return lines;
}
