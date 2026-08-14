export type ActionCategory =
  | 'PERCEPTION' | 'MOVEMENT' | 'HANDLING' | 'SOCIAL' | 'EXCHANGE' | 'PRODUCTION'
  | 'INSTITUTION' | 'KNOWLEDGE' | 'ENVIRONMENT' | 'SYSTEM' | 'OWNERSHIP' | 'CAUSALITY';

export type ActionEffect =
  | 'OBSERVE' | 'MOVE' | 'MANIPULATE' | 'SOCIAL' | 'TRANSFER' | 'PRODUCE'
  | 'INSTITUTION' | 'KNOWLEDGE' | 'ENVIRONMENT' | 'SYSTEM' | 'OWNERSHIP' | 'CAUSALITY';

export type ActionDefinition = {
  id: string;
  category: ActionCategory;
  effect: ActionEffect;
  surfaces: string[];
  semanticFamily: string;
  discoverable: boolean;
  minimumUnderstanding: number;
};

const CATEGORY_EFFECT: Record<ActionCategory, ActionEffect> = {
  PERCEPTION: 'OBSERVE', MOVEMENT: 'MOVE', HANDLING: 'MANIPULATE', SOCIAL: 'SOCIAL',
  EXCHANGE: 'TRANSFER', PRODUCTION: 'PRODUCE', INSTITUTION: 'INSTITUTION', KNOWLEDGE: 'KNOWLEDGE',
  ENVIRONMENT: 'ENVIRONMENT', SYSTEM: 'SYSTEM', OWNERSHIP: 'OWNERSHIP', CAUSALITY: 'CAUSALITY',
};

const SPECS: Record<ActionCategory, string[]> = {
  PERCEPTION: [
    'LOOK|look|see|observe|view','EXAMINE|examine|inspect|study|check','SEARCH|search|find|seek|hunt','WATCH|watch|monitor|keep an eye on',
    'LISTEN|listen|hear|eavesdrop','SMELL|smell|sniff','TASTE|taste|sample','TOUCH|touch|feel','READ|read|peruse','COMPARE|compare|contrast',
    'TRACE|trace|track','COUNT|count|enumerate','MEASURE|measure|gauge','IDENTIFY|identify|recognise|recognize','MARK|mark|tag','REVEAL|reveal|uncover|expose'
  ],
  MOVEMENT: [
    'MOVE|move|go|travel','ENTER|enter|go in|step inside','LEAVE|leave|exit|go out','FOLLOW|follow|trail','CROSS|cross|go across','CLIMB|climb|scale',
    'DESCEND|descend|go down','JUMP|jump|leap','CRAWL|crawl|creep','WAIT|wait|stay','BOARD|board|get on','DISEMBARK|disembark|get off',
    'RETURN|return|go back','PURSUE|pursue|chase','FLEE|flee|run away','SQUEEZE|squeeze through|slip through'
  ],
  HANDLING: [
    'TAKE|take|grab|pick up|collect','DROP|drop|discard|let go','PUT|put|place|set down','OPEN|open|unseal','CLOSE|close|shut','LOCK|lock|secure',
    'UNLOCK|unlock|unfasten','BREAK|break|smash','REPAIR|repair|fix|mend','TURN|turn|rotate','PULL|pull|tug','PUSH|push|shove','PRESS|press|push button',
    'ATTACH|attach|connect|fasten','DETACH|detach|disconnect|remove','FILL|fill|top up','EMPTY|empty|drain','POUR|pour|tip','WRAP|wrap|cover','CUT|cut|slice',
    'BURN|burn|ignite','EXTINGUISH|extinguish|put out','HIDE|hide|conceal'
  ],
  SOCIAL: [
    'ASK|ask|question','TELL|tell|inform','GREET|greet|say hello','THREATEN|threaten|intimidate','PERSUADE|persuade|convince','PROMISE|promise|pledge',
    'LIE|lie|deceive','ACCUSE|accuse|blame','THANK|thank|show gratitude','APOLOGISE|apologise|apologize|say sorry','ORDER|order|command','REQUEST|request|ask for',
    'WARN|warn|caution','INTRODUCE|introduce|present','NAME|name|call','COMPLAIN|complain|object'
  ],
  EXCHANGE: [
    'GIVE|give|hand over','TAKE_FROM|take from|receive from','BUY|buy|purchase','SELL|sell|vend','TRADE|trade|swap','LEND|lend|loan','BORROW|borrow|take loan',
    'PAY|pay|settle','CHARGE|charge|bill','OWE|owe|be indebted','DONATE|donate|contribute','CLAIM|claim|appropriate','ABANDON|abandon|relinquish','BID|bid|offer price'
  ],
  PRODUCTION: [
    'MAKE|make|create|craft','COMBINE|combine|join|merge','SEPARATE|separate|split','COOK|cook|prepare food','BUILD|build|construct','PROCESS|process|work',
    'HARVEST|harvest|gather crop','PLANT|plant|sow','MINE|mine|excavate','REFINE|refine|purify','PACKAGE|package|pack','DELIVER|deliver|bring',
    'ASSEMBLE|assemble|put together','DISASSEMBLE|disassemble|take apart','FORGE|forge|smith','BREW|brew|steep'
  ],
  INSTITUTION: [
    'REGISTER|register|enrol|enroll','SIGN|sign|endorse','TRANSFER|transfer|assign','AUTHORISE|authorise|authorize|permit','DENY|deny|refuse','WITNESS|witness|attest',
    'CONTRACT|contract|agree formally','HIRE|hire|employ','FIRE|fire|dismiss','VOTE|vote|ballot','REPORT|report|file report','APPEAL|appeal|contest',
    'CERTIFY|certify|validate','LICENSE|license|licence','INSPECT|inspect officially|audit','DECLARE|declare|state formally'
  ],
  KNOWLEDGE: [
    'RESEARCH|research|investigate','RECORD|record|write down|log','REMEMBER|remember|recall','FORGET|forget|discard memory','COPY|copy|duplicate text','ERASE|erase|delete',
    'VERIFY|verify|confirm','PROVE|prove|demonstrate','INFER|infer|deduce','MAP|map|chart','ANNOTATE|annotate|note','TRANSLATE|translate|interpret language',
    'DECODE|decode|decipher','CLASSIFY|classify|categorise|categorize','CONNECT|connect ideas|relate','SUMMARISE|summarise|summarize'
  ],
  ENVIRONMENT: [
    'DIG|dig|excavate ground','SWIM|swim|paddle','SAIL|sail|navigate water','FISH|fish|angle','HUNT|hunt prey|track prey','GATHER|gather|forage','LIGHT|light|illuminate',
    'DARKEN|darken|dim','HEAT|heat|warm','COOL|cool|chill','WATER|water|irrigate','DRY|dry|dehydrate','SHELTER|shelter|take cover','SLEEP|sleep|rest'
  ],
  SYSTEM: [
    'HELP|help|hint','STATUS|status|state','PING|ping|test','ANNOUNCE|announce|broadcast','SUBSCRIBE|subscribe|follow updates','UNSUBSCRIBE|unsubscribe|stop updates',
    'QUERY|query|ask system','ACKNOWLEDGE|acknowledge|ack','REPEAT|repeat|again','UNDO|undo|revert','REDO|redo|do again','HISTORY|history|show history',
    'INVENTORY|inventory|what am i carrying','TITLE|title|what am i'
  ],
  OWNERSHIP: [
    'OWN|own|possess','SHARE|share|co-own','RESERVE|reserve|hold','LEASE|lease|rent out','RENT|rent|hire temporarily','MORTGAGE|mortgage|secure debt',
    'BEQUEATH|bequeath|leave to','INHERIT|inherit|receive estate','SEIZE|seize|confiscate','RETURN_ITEM|return item|give back'
  ],
  CAUSALITY: [
    'CAUSE|cause|make happen','PREVENT|prevent|stop','DELAY|delay|postpone','ACCELERATE|accelerate|speed up','REVERSE|reverse|invert','REDIRECT|redirect|reroute',
    'LINK|link|bind','UNLINK|unlink|unbind'
  ],
};

const categoryTier: Record<ActionCategory, number> = {
  PERCEPTION: 0, MOVEMENT: 0, HANDLING: 0, SOCIAL: 1, EXCHANGE: 1, KNOWLEDGE: 1,
  ENVIRONMENT: 2, PRODUCTION: 2, INSTITUTION: 3, OWNERSHIP: 3, CAUSALITY: 4, SYSTEM: 0,
};

export const ACTION_CATALOG: ActionDefinition[] = Object.entries(SPECS).flatMap(([category, rows]) =>
  rows.map((row) => {
    const [id, ...surfaces] = row.split('|');
    return {
      id: id!, category: category as ActionCategory, effect: CATEGORY_EFFECT[category as ActionCategory],
      surfaces, semanticFamily: `${category.toLowerCase()}:${id!.toLowerCase()}`,
      discoverable: !['PING','STATUS','ACKNOWLEDGE'].includes(id!), minimumUnderstanding: categoryTier[category as ActionCategory],
    } satisfies ActionDefinition;
  })
);

export const ACTION_BY_ID = new Map(ACTION_CATALOG.map((action) => [action.id, action]));

export const PROXIMITY_INDEX = (() => {
  const index = new Map<string, string[]>();
  for (const action of ACTION_CATALOG) {
    for (const surface of action.surfaces) {
      const key = surface.toLowerCase();
      const current = index.get(key) ?? [];
      current.push(action.id);
      index.set(key, current);
    }
  }
  return index;
})();

export function resolveAuthoredSurface(raw: string) {
  const clean = raw.trim().toLowerCase().replace(/[?.!,]+$/g, '').replace(/\s+/g, ' ');
  const matches: Array<{ action: ActionDefinition; surface: string; remainder: string }> = [];
  for (const action of ACTION_CATALOG) {
    for (const surface of action.surfaces) {
      if (clean === surface || clean.startsWith(`${surface} `)) {
        matches.push({ action, surface, remainder: clean.slice(surface.length).trim() });
      }
    }
  }
  matches.sort((a, b) => b.surface.length - a.surface.length);
  return matches[0];
}

export function actionCatalogStats() {
  const surfaces = ACTION_CATALOG.flatMap((action) => action.surfaces);
  const collisions = [...PROXIMITY_INDEX.entries()].filter(([, ids]) => ids.length > 1);
  return { actions: ACTION_CATALOG.length, surfaces: surfaces.length, exactSurfaceCollisions: collisions.length };
}
