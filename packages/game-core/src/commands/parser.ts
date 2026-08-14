import { ACTION_BY_ID, resolveAuthoredSurface } from '@unintended/world-data';
import type { CommandIntent } from '../model.js';

export const ACTION_CATEGORY: Record<string, string> = Object.fromEntries([...ACTION_BY_ID.values()].map(action=>[action.id,action.category]));
ACTION_CATEGORY.INQUIRE='INQUIRY';

const LEGACY_HINTS:Record<string,string>={
  stroll:'MOVE',wander:'MOVE',walk:'MOVE',head:'MOVE',proceed:'MOVE',pickup:'TAKE',pick:'TAKE',yoink:'TAKE',inspect:'EXAMINE',peer:'LOOK',
};

export type SemanticIntent = {
  kind: 'COMMAND' | 'PROXIMITY' | 'INQUIRY' | 'UNKNOWN';
  verb: string;
  args: string[];
  raw: string;
  exact: boolean;
  category?: string;
  confidence?: number;
  surfaceVerb?: string;
  matchedSurface?: string;
  questionKind?: 'IDENTIFY'|'LOCATE'|'CAUSE'|'METHOD'|'RELATION'|'DESCRIBE'|'PURPOSE';
  subject?: string;
  specificity?: number;
};

export function parseCommand(raw:string): CommandIntent {
  const clean = raw.trim().replace(/\s+/g,' ');
  const [verb='', ...args] = clean.split(' ');
  return { verb: verb.toUpperCase(), args, raw: clean };
}

function looksLikeQuestion(clean: string) {
  return /\?$/.test(clean) || /^(what|who|where|why|how|which|does|do|did|is|are|can|could|would|should|tell me|describe|explain|identify|what for)\b/i.test(clean);
}
function questionKind(clean: string): SemanticIntent['questionKind'] {
  if (/^where\b/i.test(clean)) return 'LOCATE';
  if (/^why\b/i.test(clean)) return 'CAUSE';
  if (/^how\b/i.test(clean)) return 'METHOD';
  if (/^(what for|what is .* for|purpose)\b/i.test(clean)) return 'PURPOSE';
  if (/^(does|do|did|is|are|can|could|would|should)\b/i.test(clean)) return 'RELATION';
  if (/^(tell me|describe|explain)\b/i.test(clean)) return 'DESCRIBE';
  return 'IDENTIFY';
}
function extractSubject(clean: string) {
  return clean.replace(/[?!.]+$/g, '')
    .replace(/^(tell me about|tell me|describe|explain|identify)\s+/i, '')
    .replace(/^(what|who|where|why|how|which)\s+(is|are|was|were|does|do|did|can|could|would|should)?\s*/i, '')
    .replace(/^(does|do|did|is|are|can|could|would|should)\s+/i, '')
    .replace(/^(the|a|an)\s+/i, '').trim();
}
function canonicalSurface(actionId:string){return actionId.toLowerCase().replace(/_/g,' ');}

export function resolveSemanticInput(raw: string, knownConcepts: Set<string>): SemanticIntent {
  const parsed = parseCommand(raw); const clean=parsed.raw;
  if(!clean)return {kind:'UNKNOWN',...parsed,exact:false};
  if(looksLikeQuestion(clean)){
    const subject=extractSubject(clean);const words=subject.split(/\s+/).filter(Boolean).length;
    return {kind:'INQUIRY',verb:'INQUIRE',args:subject?subject.split(' '):[],raw:clean,exact:false,category:'INQUIRY',questionKind:questionKind(clean),subject,specificity:Math.min(1,.24+words*.16+(clean.length>24?.2:0))};
  }

  const authored=resolveAuthoredSurface(clean);
  if(authored){
    const {action,surface,remainder}=authored; const args=remainder?remainder.split(' '):[];
    const exact=surface===canonicalSurface(action.id)||parsed.verb===action.id;
    if(exact||knownConcepts.has(action.id))return {kind:'COMMAND',verb:action.id,args,raw:clean,exact,category:action.category,confidence:exact?1:.88,surfaceVerb:parsed.verb.toLowerCase(),matchedSurface:surface};
    return {kind:'PROXIMITY',verb:action.id,args,raw:clean,exact:false,category:action.category,confidence:.78,surfaceVerb:parsed.verb.toLowerCase(),matchedSurface:surface};
  }

  const hinted=LEGACY_HINTS[parsed.verb.toLowerCase()];
  if(hinted){const action=ACTION_BY_ID.get(hinted);return {kind:knownConcepts.has(hinted)?'COMMAND':'PROXIMITY',verb:hinted,args:parsed.args,raw:clean,exact:false,category:action?.category,confidence:.68,surfaceVerb:parsed.verb.toLowerCase(),matchedSurface:parsed.verb.toLowerCase()};}
  if(ACTION_BY_ID.has(parsed.verb)){const action=ACTION_BY_ID.get(parsed.verb)!;return {kind:'COMMAND',verb:parsed.verb,args:parsed.args,raw:clean,exact:true,category:action.category,confidence:1,surfaceVerb:parsed.verb.toLowerCase(),matchedSurface:canonicalSurface(parsed.verb)};}
  return {kind:'UNKNOWN',...parsed,exact:false,surfaceVerb:parsed.verb.toLowerCase(),confidence:0};
}
