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
function hash(value:string){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}

export async function mapLoreForPlayer(playerId:string,journey?:{stage?:string;mode?:string}){
 const origin=originForPlayer(playerId),identity=mapIdentityForMapId(origin.id),variation=mapVariationForMapId(origin.id),version=mapVersionForMapId(origin.id),band=apparentBand(journey?.stage);
 const npcs=await db.select().from(npcState).where(eq(npcState.mapId,origin.id));
 const shared=await db.select({type:importantHistory.type,summary:importantHistory.summary,createdAt:importantHistory.createdAt}).from(importantHistory).orderBy(desc(importantHistory.createdAt)).limit(8);
 const history=shared.map(row=>({...interpretSharedHistory(origin.id,{type:row.type,summary:row.summary}),at:row.createdAt.toISOString()}));
 const professions=[...new Map(npcs.flatMap(npc=>{const data=(npc.data??{}) as Record<string,unknown>,tags=Array.isArray(data.professionTags)?data.professionTags.filter((tag):tag is string=>typeof tag==='string'):[];return tags.map(tag=>[tag,{id:tag,npcId:npc.id,npcName:npc.name,job:npc.job}]);})).values()];
 const selectedConsequence=version.consequences[hash(`${playerId}:${version.id}`)%version.consequences.length]!;
 const outwardLead=journey?.mode==='CURIOSITY'?version.curiosityLead:journey?.mode==='MIXED'?(hash(`${playerId}:lead`)%2?version.curiosityLead:version.questLead):version.questLead;
 return {
  mapId:origin.id,mapName:origin.name,designation:variation.designation,archetypeId:identity.archetypeId,title:identity.title,domain:identity.domain,
  publicLore:identity.publicLore,currentCrisis:identity.currentCrisis,ruleBias:identity.ruleBias,institutions:identity.institutions,
  objectives:identity.objectives.map(objective=>({id:objective.id,title:objective.title,detail:objective.publicDetail,domain:objective.domain})),culturalAttitudes:identity.culturalAttitudes,
  version:{id:version.id,designation:version.designation,surfacePressure:version.surfacePressure,apparentState:band,apparentStateDetail:version.stateBands[band],travelLead:outwardLead,foreignCultures:[...version.foreignArchetypes],apparentConsequence:['INTERFERENCE','AFTERMATH'].includes(journey?.stage??'')?selectedConsequence:null},
  progressionPrinciple:'Local evidence can establish a contradiction. Wider travel is what tells you whether it is local, inherited, borrowed, or part of something larger.',
  npcPopulation:npcs.map(npc=>{const data=(npc.data??{}) as Record<string,unknown>;return {id:npc.id,name:npc.name,job:npc.job,locationId:npc.locationId,professionTags:Array.isArray(data.professionTags)?data.professionTags:[],roleNote:typeof data.roleNote==='string'?data.roleNote:null};}),
  professions,history
 };
}

export async function attachMapLore<T extends Record<string,unknown>>(state:T,playerId:string){
 const journey=(state as any).journey as {stage?:string;mode?:string}|undefined,lore=await mapLoreForPlayer(playerId,journey),existing=Array.isArray((state as any).threads)?(state as any).threads:[];
 const localThreads=[{id:`map-version:${lore.mapId}`,title:lore.version.designation,detail:lore.version.apparentStateDetail,state:'WATCHING'}];
 if(['INVESTIGATION','INTERFERENCE','AFTERMATH'].includes(journey?.stage??''))localThreads.push({id:`map-travel:${lore.mapId}`,title:'This Explanation Does Not Stay Local',detail:lore.version.travelLead,state:'WATCHING'});
 if(lore.version.apparentConsequence)localThreads.push({id:`map-consequence:${lore.mapId}`,title:'The Map Has Started Using Your Involvement',detail:lore.version.apparentConsequence,state:'WATCHING'});
 return {...state,threads:[...localThreads,...existing].slice(0,7),mapLore:lore};
}
