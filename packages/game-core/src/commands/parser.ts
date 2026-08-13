import type { CommandIntent } from '../model.js';

export const ACTION_CATEGORY: Record<string, string> = {
  LOOK: 'PERCEPTION',
  READ: 'PERCEPTION',
  MOVE: 'MOVEMENT',
  TAKE: 'HANDLING',
  DROP: 'HANDLING',
  OPEN: 'HANDLING',
  GIVE: 'EXCHANGE',
  BUY: 'EXCHANGE',
  SELL: 'EXCHANGE',
  HELP: 'INTERACTION',
  INQUIRE: 'INQUIRY',
};

const ALIASES: Record<string, string[]> = {
  LOOK: ['examine', 'inspect', 'observe', 'see', 'view', 'search', 'find', 'scan', 'peer'],
  MOVE: ['go', 'walk', 'stroll', 'wander', 'head', 'travel', 'leave', 'proceed', 'follow'],
  TAKE: ['pickup', 'pick', 'grab', 'collect', 'acquire', 'carry'],
  DROP: ['discard', 'put', 'release', 'ditch'],
  OPEN: ['unlock', 'unseal', 'uncover'],
  GIVE: ['hand', 'offer', 'pass'],
  BUY: ['purchase', 'pay'],
  SELL: ['trade', 'vend'],
  READ: ['study', 'peruse'],
  HELP: ['hint', 'assist', 'explain'],
};

const CANONICAL = new Set(Object.keys(ACTION_CATEGORY).filter((verb) => verb !== 'INQUIRE'));
const aliasToVerb = new Map<string, string>();
for (const [verb, aliases] of Object.entries(ALIASES)) {
  for (const alias of aliases) aliasToVerb.set(alias, verb);
}

export type SemanticIntent = {
  kind: 'COMMAND' | 'PROXIMITY' | 'INQUIRY';
  verb: string;
  args: string[];
  raw: string;
  exact: boolean;
  category?: string;
  confidence?: number;
  surfaceVerb?: string;
  questionKind?: 'IDENTIFY'|'LOCATE'|'CAUSE'|'METHOD'|'RELATION'|'DESCRIBE';
  subject?: string;
  specificity?: number;
};

export function parseCommand(raw:string): CommandIntent {
  const clean = raw.trim().replace(/\s+/g,' ');
  const [verb='', ...args] = clean.split(' ');
  return { verb: verb.toUpperCase(), args, raw: clean };
}

function looksLikeQuestion(clean: string) {
  return /\?$/.test(clean) || /^(what|who|where|why|how|which|does|do|did|is|are|can|could|would|should|tell me|describe|explain|identify)\b/i.test(clean);
}

function questionKind(clean: string): SemanticIntent['questionKind'] {
  if (/^where\b/i.test(clean)) return 'LOCATE';
  if (/^why\b/i.test(clean)) return 'CAUSE';
  if (/^how\b/i.test(clean)) return 'METHOD';
  if (/^(does|do|did|is|are|can|could|would|should)\b/i.test(clean)) return 'RELATION';
  if (/^(tell me|describe|explain)\b/i.test(clean)) return 'DESCRIBE';
  return 'IDENTIFY';
}

function extractSubject(clean: string) {
  return clean
    .replace(/[?!.]+$/g, '')
    .replace(/^(tell me about|tell me|describe|explain|identify)\s+/i, '')
    .replace(/^(what|who|where|why|how|which)\s+(is|are|was|were|does|do|did|can|could|would|should)?\s*/i, '')
    .replace(/^(does|do|did|is|are|can|could|would|should)\s+/i, '')
    .replace(/^(the|a|an)\s+/i, '')
    .trim();
}

export function resolveSemanticInput(raw: string, knownConcepts: Set<string>): SemanticIntent {
  const parsed = parseCommand(raw);
  const clean = parsed.raw;
  if (!clean) return { kind: 'COMMAND', ...parsed, exact: true };

  if (looksLikeQuestion(clean)) {
    const subject = extractSubject(clean);
    const words = subject.split(/\s+/).filter(Boolean).length;
    return {
      kind: 'INQUIRY',
      verb: 'INQUIRE',
      args: subject ? subject.split(' ') : [],
      raw: clean,
      exact: false,
      category: 'INQUIRY',
      questionKind: questionKind(clean),
      subject,
      specificity: Math.min(1, 0.25 + words * 0.18 + (clean.length > 24 ? 0.18 : 0)),
    };
  }

  const surfaceVerb = parsed.verb.toLowerCase();
  if (CANONICAL.has(parsed.verb)) {
    return { kind: 'COMMAND', ...parsed, exact: true, category: ACTION_CATEGORY[parsed.verb], confidence: 1, surfaceVerb };
  }

  const canonical = aliasToVerb.get(surfaceVerb);
  if (canonical) {
    const category = ACTION_CATEGORY[canonical];
    if (knownConcepts.has(canonical)) {
      return { kind: 'COMMAND', verb: canonical, args: parsed.args, raw: clean, exact: false, category, confidence: 0.82, surfaceVerb };
    }
    return { kind: 'PROXIMITY', verb: canonical, args: parsed.args, raw: clean, exact: false, category, confidence: 0.72, surfaceVerb };
  }

  return { kind: 'COMMAND', ...parsed, exact: false, surfaceVerb };
}
