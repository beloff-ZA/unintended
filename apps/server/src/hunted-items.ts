import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { anomalyClaimsV2, entities, importantHistory, playerProgress } from './db/schema.js';
import { originForPlayer } from './social.js';

export type HuntedArtifact={templateId:string;name:string;custodyClass:'CONTROLLED'|'CONTESTED'|'BOUND';minTier:number;minClaims:number;portable:boolean;};

export const HUNTED_ARTIFACTS:HuntedArtifact[]=[
 {templateId:'artifact:registry-stamp-that-stamps-back',name:'Registry Stamp That Stamps Back',custodyClass:'CONTROLLED',minTier:3,minClaims:3,portable:true},
 {templateId:'artifact:key-to-a-door-that-isnt-here',name:"Key to a Door That Isn't Here",custodyClass:'CONTESTED',minTier:4,minClaims:5,portable:true},
 {templateId:'artifact:quiet-bell',name:'The Quiet Bell',custodyClass:'CONTROLLED',minTier:4,minClaims:4,portable:true},
 {templateId:'artifact:clerks-last-word',name:"The Clerk's Last Word",custodyClass:'BOUND',minTier:5,minClaims:6,portable:true},
 {templateId:'artifact:coin-with-no-previous-owner',name:'Coin With No Previous Owner',custodyClass:'BOUND',minTier:5,minClaims:7,portable:true},
];

function hash(value:string){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}

export async function maybeSurfaceHuntedArtifact(playerId:string,locationId:string){
 const [progress]=await db.select().from(playerProgress).where(eq(playerProgress.playerId,playerId));if(!progress)return null;
 const claims=await db.select({id:anomalyClaimsV2.instanceId}).from(anomalyClaimsV2).where(eq(anomalyClaimsV2.playerId,playerId));
 for(const artifact of HUNTED_ARTIFACTS){
  if(progress.hiddenTier<artifact.minTier||claims.length<artifact.minClaims)continue;
  const [existing]=await db.select({id:entities.id}).from(entities).where(eq(entities.templateId,artifact.templateId)).limit(1);if(existing)continue;
  // A qualifying player still needs the world to line up. This is deterministic per player/claim count and intentionally undisclosed.
  if(hash(`${playerId}:${artifact.templateId}:${claims.length}`)%3!==0)continue;
  const map=originForPlayer(playerId),id=`${artifact.templateId}:${Date.now()}`;
  const [created]=await db.insert(entities).values({id,templateId:artifact.templateId,mapId:map.id,name:artifact.name,kind:'ITEM',locationId,ownerId:null,portable:artifact.portable,openable:false,open:false,replenishes:false,data:{hunted:true,custodyClass:artifact.custodyClass,globallyUnique:true}}).onConflictDoNothing().returning({id:entities.id});
  if(!created)continue;
  await db.insert(importantHistory).values({type:'HUNTED_ARTIFACT_SURFACED',summary:`A globally hunted object surfaced: ${artifact.name}.`,payload:{itemId:id,templateId:artifact.templateId,mapId:map.id,locationId,custodyClass:artifact.custodyClass}});
  return {id,name:artifact.name,custodyClass:artifact.custodyClass};
 }
 return null;
}
