import { desc, eq } from 'drizzle-orm';
import { interpretSharedHistory, mapIdentityForMapId, mapVariationForMapId, mapVersionForMapId, type MapStateBand } from '@unintended/world-data';
import { db } from './db/index.js';
import { importantHistory, npcState } from './db/schema.js';
import { originForPlayer } from './social.js';

function apparentBand(stage:string|undefined):MapStateBand{
 if(stage==='INTERFERENCE'||stage==='AFTERMATH')return 'ACTIVE';
 if(stage==='INVESTIGATION')return 'FRAYED';
 return 'STABLE';
}

export async function mapLoreForPlayer(playerId:string,journeyStage?:string){
 const origin=originForPlayer(playerId),identity=mapIdentityForMapId(origin.id),variation=mapVariationForMapId(origin.id),version=mapVersionForMapId(origin.id),band=apparentBand(journeyStage);
 const npcs=await db.select().from(npcState).where(eq(npcState.mapId,origin.id));
 const shared=await db.select({type:importantHistory.type,summary:importantHistory.summary,createdAt:importantHistory.createdAt}).from(importantHistory).orderBy(desc(importantHistory.createdAt)).limit(8);
 const history=shared.map(row=>({...interpretSharedHistory(origin.id,{type:row.type,summary:row.summary}),at:row.createdAt.toISOString()}));
 const professions=[...new Map(npcs.flatMap(npc=>{const data=(npc.data??{}) as Record<string,unknown>,tags=Array.isArray(data.professionTags)?data.professionTags.filter((tag):tag is string=>typeof tag==='string'):[];return tags.map(tag=>[tag,{id:tag,npcId:npc.id,npcName:npc.name,job:npc.job}]);})).values()];
 return {
  mapId:origin.id,mapName:origin.name,designation:variation.designation,archetypeId:identity.archetypeId,title:identity.title,domain:identity.domain,
  publicLore:identity.publicLore,currentCrisis:identity.currentCrisis,ruleBias:identity.ruleBias,institutions:identity.institutions,
  objectives:identity.objectives.map(objective=>({id:objective.id,title:objective.title,detail:objective.publicDetail,domain:objective.domain})),culturalAttitudes:identity.culturalAttitudes,
  version:{id:version.id,designation:version.designation,surfacePressure:version.surfacePressure,apparentState:band,apparentStateDetail:version.stateBands[band],travelLeads:{institutional:version.questLead,curiosity:version.curiosityLead},foreignCultures:[...version.foreignArchetypes]},
  progressionPrinciple:'Local evidence can establish a contradiction. Wider travel is what tells you whether it is local, inherited, borrowed, or part of something larger.',
  npcPopulation:npcs.map(npc=>{const data=(npc.data??{}) as Record<string,unknown>;return {id:npc.id,name:npc.name,job:npc.job,locationId:npc.locationId,professionTags:Array.isArray(data.professionTags)?data.professionTags:[],roleNote:typeof data.roleNote==='string'?data.roleNote:null};}),
  professions,history
 };
}

export async function attachMapLore<T extends Record<string,unknown>>(state:T,playerId:string){
 const journey=(state as any).journey as {stage?:string}|undefined,lore=await mapLoreForPlayer(playerId,journey?.stage),existing=Array.isArray((state as any).threads)?(state as any).threads:[];
 const localThreads=[{id:`map-version:${lore.mapId}`,title:lore.version.designation,detail:lore.version.surfacePressure,state:'WATCHING'}];
 if(['INVESTIGATION','INTERFERENCE','AFTERMATH'].includes(journey?.stage??''))localThreads.push({id:`map-travel:${lore.mapId}`,title:'This Explanation Does Not Stay Local',detail:lore.version.travelLeads.institutional,state:'WATCHING'});
 return {...state,threads:[...localThreads,...existing].slice(0,7),mapLore:lore};
}
