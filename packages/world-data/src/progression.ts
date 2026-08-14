import { ACTION_BY_ID, type ActionCategory } from './actions.js';

export type UnderstandingDimension =
  | 'perception' | 'navigation' | 'manipulation' | 'social' | 'economy' | 'production'
  | 'knowledge' | 'institutional' | 'ownership' | 'causality' | 'systems' | 'anomaly_reasoning'
  | 'breadth' | 'depth';

export type UnderstandingProfile = Record<UnderstandingDimension, number>;
export type UnderstandingEvidence = {
  actionId?: string;
  category?: ActionCategory;
  contextKey: string;
  success: boolean;
  distinctContextOrdinal: number;
  anomaly?: boolean;
  thresholdGrade?: 'BARE'|'COMPETENT'|'MASTERY';
};

export const EMPTY_UNDERSTANDING: UnderstandingProfile = {
  perception:0,navigation:0,manipulation:0,social:0,economy:0,production:0,knowledge:0,
  institutional:0,ownership:0,causality:0,systems:0,anomaly_reasoning:0,breadth:0,depth:0,
};

const CATEGORY_DIMENSION: Record<ActionCategory, UnderstandingDimension> = {
  PERCEPTION:'perception',MOVEMENT:'navigation',HANDLING:'manipulation',SOCIAL:'social',EXCHANGE:'economy',
  PRODUCTION:'production',INSTITUTION:'institutional',KNOWLEDGE:'knowledge',ENVIRONMENT:'systems',SYSTEM:'systems',
  OWNERSHIP:'ownership',CAUSALITY:'causality',
};

export function applyUnderstandingEvidence(current: Partial<UnderstandingProfile>, evidence: UnderstandingEvidence): UnderstandingProfile {
  const next = { ...EMPTY_UNDERSTANDING, ...current };
  const action = evidence.actionId ? ACTION_BY_ID.get(evidence.actionId) : undefined;
  const category = evidence.category ?? action?.category;
  if (category) {
    const dimension = CATEGORY_DIMENSION[category];
    const novelty = Math.max(0.06, 1 / Math.sqrt(Math.max(1, evidence.distinctContextOrdinal)));
    const successFactor = evidence.success ? 1 : 0.28;
    const complexity = 1 + Math.min(4, action?.minimumUnderstanding ?? 0) * 0.16;
    next[dimension] += 2.4 * novelty * successFactor * complexity;
  }
  if (evidence.anomaly) next.anomaly_reasoning += 8;
  if (evidence.thresholdGrade === 'BARE') next.systems += 2;
  if (evidence.thresholdGrade === 'COMPETENT') { next.systems += 5; next.knowledge += 2; }
  if (evidence.thresholdGrade === 'MASTERY') { next.systems += 9; next.knowledge += 4; next.depth += 5; }

  const core = (Object.keys(CATEGORY_DIMENSION) as ActionCategory[]).map((category) => next[CATEGORY_DIMENSION[category]]);
  const uniqueDimensions = [...new Set(Object.values(CATEGORY_DIMENSION))];
  next.breadth = uniqueDimensions.filter((dimension) => next[dimension] >= 8).length * 3;
  next.depth = Math.max(next.depth, uniqueDimensions.filter((dimension) => next[dimension] >= 30).length * 4);
  return next;
}

export function understandingIndex(profile: Partial<UnderstandingProfile>) {
  const p = { ...EMPTY_UNDERSTANDING, ...profile };
  const dimensions: UnderstandingDimension[] = ['perception','navigation','manipulation','social','economy','production','knowledge','institutional','ownership','causality','systems','anomaly_reasoning'];
  const cappedTotal = dimensions.reduce((sum, dimension) => sum + Math.min(80, p[dimension]), 0);
  const breadth = dimensions.filter((dimension) => p[dimension] >= 8).length;
  const depth = dimensions.filter((dimension) => p[dimension] >= 30).length;
  return cappedTotal * 0.35 + breadth * 8 + depth * 6 + Math.min(40, p.anomaly_reasoning * 0.4);
}

const TIER_THRESHOLDS = [0, 8, 25, 55, 100, 170, 260, 380, 540, 740] as const;
export function hiddenUnderstandingTier(profile: Partial<UnderstandingProfile>) {
  const index = understandingIndex(profile);
  let tier = 0;
  for (let i = 0; i < TIER_THRESHOLDS.length; i += 1) if (index >= TIER_THRESHOLDS[i]!) tier = i;
  return tier;
}

const TITLE_PARTS = [
  {lead:['Mostly','Barely','Incidentally','Provisionally','Occasionally','Technically'], noun:['Present','A Witness','Involved','A Participant','Observant','Allowed Indoors']},
  {lead:['Unauthorised','Accidental','Questionable','Tentative','Unlicensed','Junior'], noun:['Observer','Handler','Walker','Interrogator','Participant','Concern']},
  {lead:['Potentially','Apparently','Marginally','Suspiciously','Increasingly','Functionally'], noun:['Literate','Capable','Relevant','Mobile','Qualified','Correct']},
  {lead:['Recognised','Registered','Practised','Persistent','Moderately','Operational'], noun:['Nuisance','Participant','Interpreter','Operator','Complication','Guess']},
  {lead:['Competent','Established','Repeat','Administrative','Qualified','Reliable'], noun:['Nuisance','Concern','Participant','Interpreter','Problem','Witness']},
  {lead:['Regional','Accredited','Notable','Persistent','Documented','Unwelcome'], noun:['Inconvenience','Authority','Complication','Interpreter','Precedent','Specialist']},
  {lead:['Systemic','Recognised','Operational','Senior','Entrenched','Certified'], noun:['Concern','Exception','Problem','Ambiguity','Hazard','Precedent']},
  {lead:['Dangerously','Unreasonably','Institutionally','Deeply','Officially','Chronically'], noun:['Informed','Correct','Relevant','Problematic','Capable','Difficult']},
  {lead:['Unscheduled','Exceptional','Precedential','System-Level','Historically','Inadvisably'], noun:['Authority','Contradiction','Problem','Exception','Influence','Fact']},
  {lead:['The Reason This','Contradiction','Administrative','Institutional','Uncontained','Terminal'], noun:['Rule Exists','Emeritus','Headache','Precedent','Exception','Interpretation']},
] as const;

function hashString(value:string){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}

export function titleFor(profile: Partial<UnderstandingProfile>, stableIdentity: string) {
  const tier = hiddenUnderstandingTier(profile);
  const parts = TITLE_PARTS[tier]!;
  const hash = hashString(`${stableIdentity}:${tier}:${Math.floor(understandingIndex(profile)/7)}`);
  const lead = parts.lead[hash % parts.lead.length]!;
  const noun = parts.noun[Math.floor(hash / parts.lead.length) % parts.noun.length]!;
  return `${lead} ${noun}`;
}

export function titleCatalogSize() {
  return TITLE_PARTS.reduce((sum, tier) => sum + tier.lead.length * tier.noun.length, 0);
}

export const UNDERSTANDING_TIER_COUNT = TIER_THRESHOLDS.length;
