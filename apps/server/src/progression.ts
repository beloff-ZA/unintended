import { eq } from 'drizzle-orm';
import { applyUnderstandingEvidence, EMPTY_UNDERSTANDING, hiddenUnderstandingTier, titleFor, type UnderstandingProfile } from '@unintended/world-data';
import { db } from './db/index.js';
import { playerProgress } from './db/schema.js';

type HintState={semantic?:Record<string,string[]>;questions?:Record<string,number>;failures?:Record<string,number>};

export type PlayerProgressSnapshot={
  understanding:UnderstandingProfile;actionCounts:Record<string,number>;contextCounts:Record<string,number>;hintState:HintState;
  currentTitle:string;hiddenTier:number;currentRegion:string;regionState:Record<string,unknown>;
};

function cleanHintState(value:unknown):HintState{return value&&typeof value==='object'?value as HintState:{};}
function capRecord<T>(record:Record<string,T>,limit:number){const entries=Object.entries(record);return entries.length<=limit?record:Object.fromEntries(entries.slice(entries.length-limit));}

export async function getPlayerProgress(playerId:string):Promise<PlayerProgressSnapshot>{
  let [row]=await db.select().from(playerProgress).where(eq(playerProgress.playerId,playerId));
  if(!row){[row]=await db.insert(playerProgress).values({playerId}).returning();}
  return {
    understanding:{...EMPTY_UNDERSTANDING,...row.understanding} as UnderstandingProfile,
    actionCounts:row.actionCounts??{},contextCounts:row.contextCounts??{},hintState:cleanHintState(row.hintState),
    currentTitle:row.currentTitle,hiddenTier:row.hiddenTier,currentRegion:row.currentRegion,regionState:(row.regionState??{}) as Record<string,unknown>
  };
}

export async function registerSemanticProbe(playerId:string,actionId:string,surface:string){
  const state=await getPlayerProgress(playerId);const semantic={...(state.hintState.semantic??{})};const current=[...(semantic[actionId]??[])];
  const normalized=surface.trim().toLowerCase().replace(/\s+/g,' ').slice(0,80);if(normalized&&!current.includes(normalized))current.push(normalized);
  semantic[actionId]=current.slice(-5);const hintState:HintState={...state.hintState,semantic};
  await db.update(playerProgress).set({hintState,updatedAt:new Date()}).where(eq(playerProgress.playerId,playerId));
  return {distinct:semantic[actionId]!.length,hintLevel:Math.min(4,semantic[actionId]!.length),newSurface:current.includes(normalized)};
}

export async function registerQuestion(playerId:string,signature:string){
  const state=await getPlayerProgress(playerId);const questions={...(state.hintState.questions??{})};const key=signature.trim().toLowerCase().replace(/\s+/g,' ').slice(0,160);
  questions[key]=(questions[key]??0)+1;const trimmed=capRecord(questions,64);const hintState:HintState={...state.hintState,questions:trimmed};
  await db.update(playerProgress).set({hintState,updatedAt:new Date()}).where(eq(playerProgress.playerId,playerId));
  return questions[key]!;
}

export async function registerFailure(playerId:string,family:string){
  const state=await getPlayerProgress(playerId);const failures={...(state.hintState.failures??{})};failures[family]=(failures[family]??0)+1;
  const hintState:HintState={...state.hintState,failures:capRecord(failures,32)};await db.update(playerProgress).set({hintState,updatedAt:new Date()}).where(eq(playerProgress.playerId,playerId));
  return failures[family]!;
}

export async function recordActionUnderstanding(playerId:string,actionId:string,contextKey:string,success:boolean,extras?:{anomaly?:boolean;thresholdGrade?:'BARE'|'COMPETENT'|'MASTERY'}){
  const state=await getPlayerProgress(playerId);const actionCounts={...state.actionCounts,[actionId]:(state.actionCounts[actionId]??0)+1};
  const contextToken=`${actionId}:${contextKey}`;const previousContextCount=state.contextCounts[contextToken]??0;
  const contextCounts={...state.contextCounts,[contextToken]:previousContextCount+1};
  let anomalyNoveltyOrdinal=1;
  if(extras?.anomaly){
    const anomalyToken=`ANOMALY:${contextKey}`,previousAnomaly=state.contextCounts[anomalyToken]??0;
    contextCounts[anomalyToken]=previousAnomaly+1;
    anomalyNoveltyOrdinal=Math.max(1,Object.keys(contextCounts).filter(key=>key.startsWith('ANOMALY:')).length);
  }
  const distinctForAction=Object.keys(contextCounts).filter(key=>key.startsWith(`${actionId}:`)).length;
  const understanding=applyUnderstandingEvidence(state.understanding,{actionId,contextKey,success,distinctContextOrdinal:Math.max(1,distinctForAction),contextRepeatOrdinal:previousContextCount+1,anomaly:extras?.anomaly,anomalyNoveltyOrdinal,thresholdGrade:extras?.thresholdGrade});
  const hiddenTier=hiddenUnderstandingTier(understanding);const currentTitle=titleFor(understanding,playerId);
  await db.update(playerProgress).set({understanding,actionCounts,contextCounts:capRecord(contextCounts,320),hiddenTier,currentTitle,updatedAt:new Date()}).where(eq(playerProgress.playerId,playerId));
  return {understanding,hiddenTier,currentTitle,titleChanged:currentTitle!==state.currentTitle,tierChanged:hiddenTier!==state.hiddenTier};
}
