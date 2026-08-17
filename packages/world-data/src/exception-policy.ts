export type ExceptionRisk='LOW'|'MODERATE'|'HIGH'|'FORBIDDEN';
export type ExceptionDisposition='RETAIN'|'CONSTRAIN'|'PATCH';

export type ExceptionAssessmentInput={
  serverAuthoritative:boolean;
  singlePlayerScope:boolean;
  boundedUses:boolean;
  reversible:boolean;
  createsUniqueItems:boolean;
  createsCurrency:boolean;
  changesOtherPlayersState:boolean;
  affectsSecurityOrAdministration:boolean;
  unboundedComputeOrNetwork:boolean;
};

export type ExceptionAssessment={
  disposition:ExceptionDisposition;
  risk:ExceptionRisk;
  reasons:string[];
  requiredControls:string[];
};

export function assessRetainableException(input:ExceptionAssessmentInput):ExceptionAssessment{
  const reasons:string[]=[],controls:string[]=[];
  if(input.affectsSecurityOrAdministration)return {disposition:'PATCH',risk:'FORBIDDEN',reasons:['Security, authentication, administration, filesystem, shell, secrets, or database authority cannot become player powers.'],requiredControls:['PATCH_IMMEDIATELY']};
  if(input.unboundedComputeOrNetwork)return {disposition:'PATCH',risk:'FORBIDDEN',reasons:['Unbounded resource consumption cannot be retained as gameplay.'],requiredControls:['PATCH_IMMEDIATELY']};
  if(!input.serverAuthoritative){reasons.push('The effect is not fully server-authoritative.');controls.push('SERVER_AUTHORITATIVE');}
  if(!input.singlePlayerScope){reasons.push('The effect can directly alter another player or the shared world.');controls.push('SINGLE_PLAYER_SCOPE_OR_EXPLICIT_CONSENT');}
  if(!input.boundedUses){reasons.push('The effect has no usage ceiling.');controls.push('CHARGES_OR_COOLDOWN');}
  if(!input.reversible){reasons.push('The effect can make an irreversible state change.');controls.push('REVERSIBLE_OR_COMPENSATING_CONSEQUENCE');}
  if(input.createsUniqueItems){reasons.push('The effect can duplicate or create unique property.');controls.push('NO_UNIQUE_DUPLICATION');}
  if(input.createsCurrency){reasons.push('The effect can create economic value.');controls.push('NO_NET_CURRENCY_CREATION');}
  if(input.changesOtherPlayersState){reasons.push('The effect can mutate another player state.');controls.push('TARGET_CONSENT_OR_NO_CROSS_PLAYER_MUTATION');}

  const severe=[input.createsUniqueItems,input.createsCurrency,input.changesOtherPlayersState].filter(Boolean).length;
  if(!input.serverAuthoritative||severe>=2)return {disposition:'PATCH',risk:'HIGH',reasons,requiredControls:[...new Set(controls)]};
  if(reasons.length)return {disposition:'CONSTRAIN',risk:severe?'HIGH':'MODERATE',reasons,requiredControls:[...new Set([...controls,'KILL_SWITCH','AUDIT_EVENT'])]};
  return {disposition:'RETAIN',risk:'LOW',reasons:['The effect is player-scoped, bounded, reversible, and server-authoritative.'],requiredControls:['AUDIT_EVENT','KILL_SWITCH']};
}

export const RETAINED_EXCEPTION_RULES=[
  'A discovered bug is assessed before it is patched into invisibility.',
  'Security, authentication, secrets, administration, arbitrary code, filesystem, shell, and database authority are never gameplay powers.',
  'Prefer a single-player exception over a global rule change.',
  'Bound powerful exceptions with charges, cooldowns, narrow targets, or consequences.',
  'Do not permit unique-item duplication or unbounded economic creation.',
  'Keep every retained exception server-authoritative, auditable, and kill-switchable.',
] as const;
