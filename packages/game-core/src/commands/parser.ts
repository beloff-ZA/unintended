import { ACTION_BY_ID, resolveAuthoredSurface } from '@unintended/world-data';
import type { CommandIntent } from '../model.js';

export const ACTION_CATEGORY:Record<string,string>=Object.fromEntries([...ACTION_BY_ID.values()].map(action=>[action.id,action.category]));
ACTION_CATEGORY.INQUIRE='INQUIRY';
ACTION_CATEGORY.CHECK_IN='SOCIAL';

const LEGACY_HINTS:Record<string,string>={
  stroll:'MOVE',wander:'MOVE',walk:'MOVE',head:'MOVE',proceed:'MOVE',goto:'MOVE',go:'MOVE',travel:'MOVE',return:'MOVE',
  pickup:'TAKE',pick:'TAKE',yoink:'TAKE',grab:'TAKE',inspect:'EXAMINE',peer:'LOOK',check:'LOOK',talk:'SPEAK',chat:'SPEAK'
};
const LOOK_AROUND=/^(look|observe|inspect|check)(\s+(around|around me|here|surroundings|the area|the room|this place))?$/i;
const WHAT_HERE=/^(what('?s| is) here|where am i|describe (here|this place)|show me around)$/i;
const ASK_PATTERN=/^(ask|question)\s+(?:the\s+)?(.+?)(?:\s+(about|why|what|who|where|when|how|whether|if)\s+)(.+)$/i;
const SPEAK_PATTERN=/^(speak|talk|chat)\s+(?:to|with)?\s*(?:the\s+)?(.+)$/i;
const CHECK_IN_PATTERN=/^(?:check\s+in\s+(?:on|with)|check\s+on|help|assist|do\s+a\s+favou?r\s+for|run\s+an\s+errand\s+for)\s+(?:the\s+)?(.+)$/i;

export type SemanticIntent={
  kind:'COMMAND'|'PROXIMITY'|'INQUIRY'|'UNKNOWN';
  verb:string;args:string[];raw:string;exact:boolean;category?:string;confidence?:number;surfaceVerb?:string;matchedSurface?:string;
  questionKind?:'IDENTIFY'|'LOCATE'|'CAUSE'|'METHOD'|'RELATION'|'DESCRIBE'|'PURPOSE';subject?:string;specificity?:number;questionScope?:'ENTITY'|'SELF'|'WORLD'|'TITLE'|'ACTION'|'REGION';
};

export function parseCommand(raw:string):CommandIntent{const clean=raw.trim().replace(/\s+/g,' ');const [verb='',...args]=clean.split(' ');return {verb:verb.toUpperCase(),args,raw:clean};}
function looksLikeQuestion(clean:string){return /\?$/.test(clean)||/^(what|who|where|why|how|which|does|do|did|is|are|can|could|would|should|tell me|describe|explain|identify|what for)\b/i.test(clean);}
function questionKind(clean:string):SemanticIntent['questionKind']{
  if(/^where\b/i.test(clean))return 'LOCATE';if(/^why\b/i.test(clean))return 'CAUSE';if(/^how\b/i.test(clean))return 'METHOD';
  if(/^(what for|what is .* for|purpose)\b/i.test(clean)||/\bpurpose\b/i.test(clean))return 'PURPOSE';
  if(/^(does|do|did|is|are|can|could|would|should)\b/i.test(clean))return 'RELATION';if(/^(tell me|describe|explain)\b/i.test(clean))return 'DESCRIBE';return 'IDENTIFY';
}
function questionScope(clean:string,subject:string):SemanticIntent['questionScope']{
  if(/\b(i|me|my|myself)\b/i.test(clean)||/^(why am i|where am i|what am i)/i.test(clean))return 'SELF';
  if(/\b(purpose|point|goal|world|here|this place|bellweather)\b/i.test(clean)&&subject.length<40)return 'WORLD';
  if(/\b(title|observer|qualified|competence|assessment)\b/i.test(clean))return 'TITLE';
  if(ACTION_BY_ID.has(subject.toUpperCase()))return 'ACTION';
  return 'ENTITY';
}
function extractSubject(clean:string){return clean.replace(/[?!.]+$/g,'').replace(/^(tell me about|tell me|describe|explain|identify)\s+/i,'').replace(/^(what|who|where|why|how|which)\s+(is|are|was|were|does|do|did|can|could|would|should|am)?\s*/i,'').replace(/^(does|do|did|is|are|can|could|would|should)\s+/i,'').replace(/^(the|a|an)\s+/i,'').trim();}
function canonicalSurface(actionId:string){return actionId.toLowerCase().replace(/_/g,' ');}
function stripPolitePrefix(clean:string){return clean.replace(/^(please\s+|could you\s+|can you\s+|would you\s+|i want to\s+|i would like to\s+)/i,'').trim();}
function normaliseMovement(clean:string){
  const match=clean.match(/^(go|move|walk|head|travel|proceed|return|jump|leave)(?:\s+(?:to|toward|towards|through|via))?\s+(.+)$/i);
  if(!match)return null;return {verb:match[1]!.toUpperCase(),destination:match[2]!.trim()};
}

export function resolveSemanticInput(raw:string,knownConcepts:Set<string>):SemanticIntent{
  const parsed=parseCommand(raw);let clean=parsed.raw;if(!clean)return {kind:'UNKNOWN',...parsed,exact:false};clean=stripPolitePrefix(clean);
  if(LOOK_AROUND.test(clean)||WHAT_HERE.test(clean))return {kind:'COMMAND',verb:'LOOK',args:[],raw:clean,exact:/^look$/i.test(clean),category:'PERCEPTION',confidence:.98,surfaceVerb:'look',matchedSurface:'look'};
  const checkIn=clean.match(CHECK_IN_PATTERN);
  if(checkIn)return {kind:'COMMAND',verb:'CHECK_IN',args:[checkIn[1]!.trim()],raw:clean,exact:false,category:'SOCIAL',confidence:.98,surfaceVerb:'check in',matchedSurface:'check in'};
  const ask=clean.match(ASK_PATTERN);
  if(ask){const npc=ask[2]!.trim(),marker=ask[3]!.toLowerCase(),rest=ask[4]!.trim();const composed=marker==='about'?rest:`${marker} ${rest}`;return {kind:'INQUIRY',verb:'INQUIRE',args:[npc,composed],raw:clean,exact:false,category:'INQUIRY',confidence:.96,questionKind:questionKind(composed),subject:npc,specificity:Math.min(1,.55+rest.split(/\s+/).length*.08),questionScope:'ENTITY'};}
  const speak=clean.match(SPEAK_PATTERN);
  if(speak)return {kind:'INQUIRY',verb:'INQUIRE',args:[speak[2]!.trim()],raw:clean,exact:false,category:'INQUIRY',confidence:.9,questionKind:'DESCRIBE',subject:speak[2]!.trim(),specificity:.48,questionScope:'ENTITY'};
  if(looksLikeQuestion(clean)){
    const subject=extractSubject(clean),words=subject.split(/\s+/).filter(Boolean).length;
    return {kind:'INQUIRY',verb:'INQUIRE',args:subject?subject.split(' '):[],raw:clean,exact:false,category:'INQUIRY',questionKind:questionKind(clean),subject,specificity:Math.min(1,.24+words*.16+(clean.length>24?.2:0)),questionScope:questionScope(clean,subject)};
  }
  const movement=normaliseMovement(clean);
  if(movement){const actionId=movement.verb==='GO'?'MOVE':movement.verb;const action=ACTION_BY_ID.get(actionId)||ACTION_BY_ID.get('MOVE');if(actionId==='MOVE'||knownConcepts.has(actionId)||movement.verb==='GO')return {kind:'COMMAND',verb:actionId==='GO'?'MOVE':actionId,args:[movement.destination],raw:clean,exact:movement.verb==='MOVE',category:action?.category??'MOVEMENT',confidence:.94,surfaceVerb:movement.verb.toLowerCase(),matchedSurface:movement.verb.toLowerCase()};}
  const authored=resolveAuthoredSurface(clean);
  if(authored){const {action,surface,remainder}=authored,args=remainder?remainder.split(' '):[],exact=surface===canonicalSurface(action.id)||parsed.verb===action.id;if(exact||knownConcepts.has(action.id))return {kind:'COMMAND',verb:action.id,args,raw:clean,exact,category:action.category,confidence:exact?1:.88,surfaceVerb:parsed.verb.toLowerCase(),matchedSurface:surface};return {kind:'PROXIMITY',verb:action.id,args,raw:clean,exact:false,category:action.category,confidence:.78,surfaceVerb:parsed.verb.toLowerCase(),matchedSurface:surface};}
  const hinted=LEGACY_HINTS[parsed.verb.toLowerCase()];if(hinted){const action=ACTION_BY_ID.get(hinted);return {kind:knownConcepts.has(hinted)?'COMMAND':'PROXIMITY',verb:hinted,args:parsed.args,raw:clean,exact:false,category:action?.category,confidence:.68,surfaceVerb:parsed.verb.toLowerCase(),matchedSurface:parsed.verb.toLowerCase()};}
  if(ACTION_BY_ID.has(parsed.verb)){const action=ACTION_BY_ID.get(parsed.verb)!;return {kind:'COMMAND',verb:parsed.verb,args:parsed.args,raw:clean,exact:true,category:action.category,confidence:1,surfaceVerb:parsed.verb.toLowerCase(),matchedSurface:canonicalSurface(parsed.verb)};}
  return {kind:'UNKNOWN',...parsed,raw:clean,exact:false,surfaceVerb:parsed.verb.toLowerCase(),confidence:0};
}
