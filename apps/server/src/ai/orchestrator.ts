import { createHash } from 'node:crypto';
import { ACTION_BY_ID } from '@unintended/world-data';
import type { CommandResult } from '@unintended/game-core';
import { db } from '../db/index.js';
import { aiInteractions } from '../db/schema.js';
import { redis } from '../auth/session.js';
import type { PostgresGameRepository } from '../repository.js';
import { RestrictedAiReasoner } from './reasoner.js';

const reasoner=new RestrictedAiReasoner();
const normalise=(value:string)=>value.trim().toLowerCase().replace(/\s+/g,' ').slice(0,240);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

async function budget(playerId:string){if(!reasoner.enabled)return false;const minute=Math.floor(Date.now()/60000),playerKey=`ai:p:${playerId}:${minute}`,globalKey=`ai:g:${minute}`;const [player,global]=await Promise.all([redis.incr(playerKey),redis.incr(globalKey)]);if(player===1)await redis.expire(playerKey,70);if(global===1)await redis.expire(globalKey,70);return player<=Number(process.env.AI_PLAYER_RPM??4)&&global<=Number(process.env.AI_GLOBAL_RPM??240);}
async function audit(playerId:string,input:string,kind:string,outcome:string){try{await db.insert(aiInteractions).values({playerId,inputHash:hash(normalise(input)),kind,model:reasoner.model,outcome});}catch{}}
function preserveSystemLines(lines:string[]){return lines.filter(line=>/^(CONCEPT|TITLE|ANOMALY)|exception is yours|Server has updated its estimate/i.test(line));}
function questionText(type:string|null,target:string|null){const subject=target?.trim()||'this';switch(type){case 'CAUSE':return `why ${subject}`;case 'LOCATION':return `where is ${subject}`;case 'PURPOSE':return `what is ${subject} for`;case 'METHOD':return `how ${subject}`;case 'RELATION':return `what is the relation of ${subject}`;default:return `what is ${subject}`;}}

export class AiOrchestrator{
 constructor(private repo:PostgresGameRepository){}
 async reinterpretKnown(playerId:string,playerText:string):Promise<string|undefined>{
  if(!reasoner.enabled||!await budget(playerId))return undefined;
  const actor=await this.repo.getActor(playerId),visible=await this.repo.listAccessibleEntities(playerId),directions=await this.repo.listLocationExits(actor.locationId);
  const cacheKey=`ai:intent:${hash(`${normalise(playerText)}:${actor.locationId}:${[...actor.knownConcepts].sort().join(',')}`)}`;
  let interpreted:any;const cached=await redis.get(cacheKey);if(cached){try{interpreted=JSON.parse(cached);}catch{}}
  if(!interpreted){interpreted=await reasoner.resolveIntent({playerText,visibleEntities:visible.map(entity=>({id:entity.id,name:entity.name})),knownActions:[...actor.knownConcepts],knownDirections:directions.map(direction=>({shape:direction.shape,label:direction.label})),failureCount:0});if(interpreted)await redis.set(cacheKey,JSON.stringify(interpreted),'EX',86400);}
  if(!interpreted||interpreted.confidence<.72){await audit(playerId,playerText,'reinterpret','low-confidence');return undefined;}
  if(interpreted.kind==='QUESTION'){await audit(playerId,playerText,'reinterpret','question');return questionText(interpreted.questionType,interpreted.targetText);}
  if(interpreted.kind!=='ACTION'||!interpreted.actionId){await audit(playerId,playerText,'reinterpret','unresolved');return undefined;}
  const action=ACTION_BY_ID.get(interpreted.actionId);if(!action){await audit(playerId,playerText,'reinterpret','invalid-action');return undefined;}
  if(!actor.knownConcepts.has(action.id)){await audit(playerId,playerText,'reinterpret','unknown-concept');return undefined;}
  const target=interpreted.targetText?.trim();await audit(playerId,playerText,'reinterpret',`execute-${action.id}`);return target?`${action.id} ${target}`:action.id;
 }

 async augment(playerId:string,playerText:string,result:CommandResult):Promise<string[]|undefined>{
  if(!reasoner.enabled||!result.semantic)return undefined;const kind=result.semantic.kind;if(kind==='UNKNOWN')return this.resolveUnknown(playerId,playerText);if(kind==='INQUIRY')return this.styleInquiry(playerId,playerText,result);return undefined;
 }
 private async resolveUnknown(playerId:string,playerText:string){
  if(!await budget(playerId))return undefined;const actor=await this.repo.getActor(playerId),visible=await this.repo.listAccessibleEntities(playerId),directions=await this.repo.listLocationExits(actor.locationId);
  const interpreted=await reasoner.resolveIntent({playerText,visibleEntities:visible.map(entity=>({id:entity.id,name:entity.name})),knownActions:[...actor.knownConcepts],knownDirections:directions.map(direction=>({shape:direction.shape,label:direction.label})),failureCount:0});
  if(!interpreted||interpreted.kind!=='ACTION'||!interpreted.actionId||interpreted.confidence<.7){await audit(playerId,playerText,'intent','unresolved');return undefined;}const action=ACTION_BY_ID.get(interpreted.actionId);if(!action)return undefined;
  const surface=normalise(playerText).split(' ').slice(0,6).join(' '),probe=await this.repo.registerSemanticProbe(playerId,action.id,surface);await audit(playerId,playerText,'intent',`probe-${probe.distinct}`);
  if(probe.distinct>=3){const discovered=await this.repo.discoverConcept(playerId,action.id);if(discovered)return [`The Server has watched you describe ${action.category.toLowerCase()} repeatedly without using its preferred terminology.`,`CONCEPT INFERRED: ${action.id}`];}
  return [reasoner.fallbackAttitude(playerText,probe.hintLevel),`Likely family: ${action.category}.`,probe.distinct>=2?'Your intention is becoming difficult to dismiss as accidental.':'The wording remains insufficiently canonical.'];
 }
 private async styleInquiry(playerId:string,playerText:string,result:CommandResult){
  if(result.lines.some(line=>/^(CONCEPT|TITLE|ANOMALY)/.test(line)))return undefined;const sample=parseInt(hash(`${playerId}:${normalise(playerText)}`).slice(0,4),16)%3;if(sample!==0||!await budget(playerId))return undefined;
  const facts=result.lines.filter(Boolean).slice(0,6).map((text,index)=>({id:`f${index}`,text}));if(!facts.length)return undefined;const styled=await reasoner.styleFacts({playerText,facts,hintLevel:1,repetitionCount:1,serverMood:'SARCASTIC'});if(!styled){await audit(playerId,playerText,'style','fallback');return undefined;}await audit(playerId,playerText,'style',styled.responseTier);return [...reasoner.renderStyled(styled,facts),...preserveSystemLines(result.lines)];
 }
}
