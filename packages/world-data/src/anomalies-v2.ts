export type AnomalyDomain = 'MATTER'|'SPACE'|'TIME'|'MONEY'|'LIFE'|'DEATH'|'IDENTITY'|'KNOWLEDGE'|'OWNERSHIP'|'CAUSALITY'|'SOCIAL'|'ENTROPY';
export type AnomalyUtility = 'TRIVIAL'|'COSMETIC'|'CONVENIENCE'|'SITUATIONAL'|'POWERFUL'|'CHEATING_FEELING'|'MYTHIC';
export type ExceptionPrimitive =
  | 'CLOSE_CLOSED'|'REMOTE_TAKE'|'REPEAT_SAFE'|'ASK_ABSENT_RECENT'|'IGNORE_LOCK_ONCE'|'CARRY_AWKWARD'
  | 'DIRECTION_ALIAS'|'WEATHER_DISREGARD'|'DOUBLE_REGISTER'|'RETAIN_AFTER_GIVE'|'OPEN_UNOPENABLE_ONCE'
  | 'DROP_REMOTE'|'REMEMBER_UNKNOWN_ROUTE'|'PAY_WITHOUT_COIN_ONCE'|'READ_CLOSED'|'RETURN_WITHOUT_PATH';

export type AnomalyEvent = { type:string; targetId?:string; locationId?:string; payload?:Record<string,unknown> };
export type TriggerRelation = 'NONE'|'SAME_TARGET'|'SAME_LOCATION'|'RETURN_TO_ORIGIN'|'TARGET_THEN_MOVE'|'CHAIN_CONTEXT';
export type AnomalyTemplate = {
  id:string; name:string; domain:AnomalyDomain; utility:AnomalyUtility; apparentUtility:AnomalyUtility;
  trigger:string[]; relation:TriggerRelation; exception:ExceptionPrimitive; rarityModulo:number; signal:string;
  minimumUnderstanding:number; antiAbuse:string[];
};
export type AnomalyCandidate = { template:AnomalyTemplate; instanceId:string; variant:number; contextSignature:string };

export const ANOMALY_TEMPLATE_COUNT = 1024;
export const ANOMALY_VARIANT_SLOTS = 32768;
export const ANOMALY_INSTANCE_CAPACITY_PER_SEED = ANOMALY_TEMPLATE_COUNT * ANOMALY_VARIANT_SLOTS;

const DOMAINS: AnomalyDomain[] = ['MATTER','SPACE','TIME','MONEY','LIFE','DEATH','IDENTITY','KNOWLEDGE','OWNERSHIP','CAUSALITY','SOCIAL','ENTROPY'];
const EXCEPTIONS: ExceptionPrimitive[] = ['CLOSE_CLOSED','REMOTE_TAKE','REPEAT_SAFE','ASK_ABSENT_RECENT','IGNORE_LOCK_ONCE','CARRY_AWKWARD','DIRECTION_ALIAS','WEATHER_DISREGARD','DOUBLE_REGISTER','RETAIN_AFTER_GIVE','OPEN_UNOPENABLE_ONCE','DROP_REMOTE','REMEMBER_UNKNOWN_ROUTE','PAY_WITHOUT_COIN_ONCE','READ_CLOSED','RETURN_WITHOUT_PATH'];
const TRIGGERS: Array<{steps:string[];relation:TriggerRelation}> = [
  {steps:['ITEM_TAKEN','DOOR_OPENED'],relation:'SAME_LOCATION'},
  {steps:['PLAYER_LOOKED','ITEM_TAKEN'],relation:'SAME_LOCATION'},
  {steps:['ITEM_DROPPED','PLAYER_MOVED'],relation:'TARGET_THEN_MOVE'},
  {steps:['PLAYER_MOVED','PLAYER_MOVED'],relation:'RETURN_TO_ORIGIN'},
  {steps:['PLAYER_LOOKED','PLAYER_MOVED'],relation:'SAME_LOCATION'},
  {steps:['DOOR_OPENED','ITEM_TAKEN'],relation:'SAME_LOCATION'},
  {steps:['ITEM_TAKEN','ITEM_DROPPED'],relation:'SAME_TARGET'},
  {steps:['ITEM_DROPPED','ITEM_TAKEN'],relation:'SAME_TARGET'},
  {steps:['SERVER_EVENT_TRIGGERED','PLAYER_LOOKED'],relation:'SAME_LOCATION'},
  {steps:['PLAYER_MOVED','SERVER_EVENT_TRIGGERED'],relation:'SAME_LOCATION'},
  {steps:['PLAYER_LOOKED','DOOR_OPENED'],relation:'SAME_LOCATION'},
  {steps:['ITEM_TAKEN','PLAYER_MOVED','ITEM_DROPPED'],relation:'CHAIN_CONTEXT'},
  {steps:['PLAYER_MOVED','PLAYER_LOOKED','PLAYER_MOVED'],relation:'RETURN_TO_ORIGIN'},
  {steps:['DOOR_OPENED','PLAYER_MOVED','PLAYER_LOOKED'],relation:'CHAIN_CONTEXT'},
  {steps:['ITEM_TAKEN','PLAYER_LOOKED','DOOR_OPENED'],relation:'CHAIN_CONTEXT'},
  {steps:['PLAYER_LOOKED','SERVER_EVENT_TRIGGERED','PLAYER_MOVED'],relation:'CHAIN_CONTEXT'},
];
const ADJECTIVES=['Deferred','Misplaced','Unscheduled','Recursive','Borrowed','Contrary','Administrative','Unlicensed','Second-Hand','Residual','Polite','Improper','Temporary','Persistent','Unhelpful','Ambiguous'];
const NOUNS=['Possession','Route','Moment','Receipt','Witness','Return','Identity','Memory','Obligation','Cause','Courtesy','Decay','Permission','Shortcut','Precedent','Condition'];

function hashString(value:string){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function utilityFor(index:number):AnomalyUtility{
  const p=index%100;
  if(p<18)return 'TRIVIAL'; if(p<40)return 'COSMETIC'; if(p<62)return 'CONVENIENCE'; if(p<80)return 'SITUATIONAL';
  if(p<92)return 'POWERFUL'; if(p<98)return 'CHEATING_FEELING'; return 'MYTHIC';
}
function rarityFor(utility:AnomalyUtility){return ({TRIVIAL:431,COSMETIC:557,CONVENIENCE:761,SITUATIONAL:997,POWERFUL:1601,CHEATING_FEELING:2593,MYTHIC:4093} as const)[utility];}
function apparentFor(utility:AnomalyUtility,index:number):AnomalyUtility{
  if(index%11===0&&['TRIVIAL','COSMETIC'].includes(utility))return 'POWERFUL';
  if(index%13===0&&utility==='SITUATIONAL')return 'CHEATING_FEELING';
  return utility;
}
function antiAbuseFor(exception:ExceptionPrimitive){
  const common=['NO_UNIQUE_DUPLICATION','NO_ANOMALY_REPLAY','SERVER_AUTHORITATIVE'];
  if(['REMOTE_TAKE','RETAIN_AFTER_GIVE','PAY_WITHOUT_COIN_ONCE'].includes(exception)) common.push('OWNERSHIP_RULES_STILL_APPLY');
  if(exception==='REPEAT_SAFE') common.push('NO_IRREVERSIBLE_GLOBAL_REPEAT');
  return common;
}

export function buildAnomalyTemplates(count=ANOMALY_TEMPLATE_COUNT):AnomalyTemplate[]{
  return Array.from({length:count},(_,index)=>{
    const domain=DOMAINS[index%DOMAINS.length]!;
    const trigger=TRIGGERS[(index*7+Math.floor(index/DOMAINS.length))%TRIGGERS.length]!;
    const exception=EXCEPTIONS[(index*5+Math.floor(index/17))%EXCEPTIONS.length]!;
    const utility=utilityFor(index);
    return {
      id:`A${String(index+1).padStart(4,'0')}`,
      name:`${ADJECTIVES[(index*3)%ADJECTIVES.length]} ${NOUNS[(index*5+Math.floor(index/16))%NOUNS.length]}`,
      domain,utility,apparentUtility:apparentFor(utility,index),trigger:[...trigger.steps],relation:trigger.relation,exception,
      rarityModulo:rarityFor(utility),signal:`${domain.toLowerCase()}_instability`,minimumUnderstanding:Math.min(8,Math.floor(index/160)),
      antiAbuse:antiAbuseFor(exception),
    };
  });
}

export const ANOMALY_TEMPLATES=buildAnomalyTemplates();
export const ANOMALY_BY_LAST_EVENT=(()=>{
  const map=new Map<string,AnomalyTemplate[]>();
  for(const template of ANOMALY_TEMPLATES){const last=template.trigger[template.trigger.length-1]!;const rows=map.get(last)??[];rows.push(template);map.set(last,rows);}
  return map;
})();

function relationMatches(relation:TriggerRelation,events:AnomalyEvent[]){
  if(relation==='NONE')return true;
  const first=events[0]!,last=events[events.length-1]!;
  if(relation==='SAME_TARGET')return !!first.targetId&&first.targetId===last.targetId;
  if(relation==='SAME_LOCATION')return !!first.locationId&&first.locationId===last.locationId;
  if(relation==='TARGET_THEN_MOVE')return !!first.targetId&&!!last.locationId;
  if(relation==='RETURN_TO_ORIGIN'){
    const origin=String(first.payload?.from??'');
    return !!origin&&last.locationId===origin;
  }
  if(relation==='CHAIN_CONTEXT') return new Set(events.map(event=>event.locationId).filter(Boolean)).size>=1;
  return false;
}
function stableEvent(event:AnomalyEvent){
  const payload=Object.entries(event.payload??{}).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}:${String(v)}`).join(',');
  return `${event.type}:${event.targetId??''}:${event.locationId??''}:${payload}`;
}

export function detectAnomalyCandidates(seed:number|string,recentEvents:AnomalyEvent[],understandingTier:number):AnomalyCandidate[]{
  if(!recentEvents.length)return [];
  const terminal=recentEvents[recentEvents.length-1]!.type;
  const templates=ANOMALY_BY_LAST_EVENT.get(terminal)??[];
  const found:AnomalyCandidate[]=[];
  for(const template of templates){
    if(understandingTier<template.minimumUnderstanding||template.trigger.length>recentEvents.length)continue;
    const tail=recentEvents.slice(-template.trigger.length);
    if(!template.trigger.every((type,index)=>tail[index]!.type===type))continue;
    if(!relationMatches(template.relation,tail))continue;
    const contextSignature=tail.map(stableEvent).join('>');
    const gate=hashString(`${seed}:${template.id}:${contextSignature}:gate`);
    if(gate%template.rarityModulo!==0)continue;
    const variant=hashString(`${seed}:${template.id}:${contextSignature}:variant`)%ANOMALY_VARIANT_SLOTS;
    found.push({template,variant,contextSignature,instanceId:`${seed}:${template.id}:${variant.toString(36)}`});
  }
  return found;
}

export function anomalyCatalogStats(){
  const utility=Object.fromEntries((['TRIVIAL','COSMETIC','CONVENIENCE','SITUATIONAL','POWERFUL','CHEATING_FEELING','MYTHIC'] as AnomalyUtility[]).map(kind=>[kind,ANOMALY_TEMPLATES.filter(a=>a.utility===kind).length]));
  return {templates:ANOMALY_TEMPLATES.length,variantSlots:ANOMALY_VARIANT_SLOTS,capacityPerSeed:ANOMALY_INSTANCE_CAPACITY_PER_SEED,utility};
}
