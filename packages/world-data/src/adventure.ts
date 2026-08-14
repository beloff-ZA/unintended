import type { UnderstandingDimension, UnderstandingProfile } from './progression.js';

export type RegionSize='TINY'|'SMALL'|'MEDIUM'|'LARGE'|'VAST';
export type RegionSeverity='FORGIVING'|'LOW'|'MODERATE'|'HOSTILE'|'DIRE';
export type ThresholdGrade='FAIL'|'BARE'|'COMPETENT'|'MASTERY';
export type RewardKind='CAPABILITY'|'PROPERTY'|'INTERFACE'|'RESOURCE'|'PRIVILEGE';
export type RegionReward={kind:RewardKind;key:string;label:string};
export type RegionGoal={id:string;label:string;kind:'OBSERVE'|'DISCOVER'|'INTERACT'|'PRODUCE'|'CONTRADICTION'|'PROJECT';target:number};
export type ThresholdRequirement={dimension:UnderstandingDimension;bare:number;competent:number;mastery:number};
export type AdventureRegion={id:string;name:string;size:RegionSize;severity:RegionSeverity;complexity:number;domain:string;contradiction:string;goals:RegionGoal[];requirements:ThresholdRequirement[];rewards:Record<'BARE'|'COMPETENT'|'MASTERY',RegionReward[]>;exits:Record<string,string>;};
export type AdventureState={visitedLocations:number;discoveredConcepts:number;anomalies:number;completedGoals:number};
export type DirectionLike={key:string;shape:string;label:string};

const ARCHETYPES=[
 ['bellweather','Bellweather','SMALL','FORGIVING','OWNERSHIP','Bellweather records ownership differently from possession. Prove where the record and reality disagree.'],
 ['attic','The Attic','TINY','MODERATE','KNOWLEDGE','Objects remember labels that were removed.'],
 ['glasshouse','The Glasshouse','SMALL','HOSTILE','MATTER','Transparent things conceal more than opaque ones.'],
 ['lowwater','Lowwater','LARGE','MODERATE','SPACE','Routes shorten when nobody is using them.'],
 ['works','The Works','VAST','HOSTILE','CAUSALITY','Machines occasionally finish causes before receiving them.'],
 ['verdant','Verdant','LARGE','MODERATE','LIFE','Growth can inherit obligations.'],
 ['terminus','Terminus','MEDIUM','DIRE','TIME','Some arrivals are recorded before departure.'],
 ['archive','The Archive','VAST','HOSTILE','KNOWLEDGE','Documents can become true by being filed correctly.'],
 ['salt-office','The Salt Office','SMALL','MODERATE','MONEY','Debt survives repayment under specific punctuation.'],
 ['borrowed-quarter','The Borrowed Quarter','LARGE','HOSTILE','IDENTITY','Addresses occasionally belong to their occupants.'],
 ['long-yard','The Long Yard','MEDIUM','LOW','SPACE','Distance disagrees with repetition.'],
 ['quiet-market','The Quiet Market','MEDIUM','MODERATE','SOCIAL','Prices change when described aloud.'],
 ['underbridge','Underbridge','SMALL','DIRE','DEATH','Absence is not consistently terminal.'],
 ['missing-bureau','Bureau of Missing Persons','LARGE','HOSTILE','IDENTITY','The registry contains people who cannot be located because they were never absent.'],
 ['rainworks','Rainworks','VAST','DIRE','ENTROPY','Weather accumulates administrative residue.'],
 ['interchange','The Interchange','VAST','DIRE','CAUSALITY','Several correct routes cannot all have been taken first.'],
] as const;

const SIZE_MULT:Record<RegionSize,number>={TINY:.7,SMALL:1,MEDIUM:1.35,LARGE:1.8,VAST:2.5};
const SEVERITY_MULT:Record<RegionSeverity,number>={FORGIVING:.7,LOW:.9,MODERATE:1.2,HOSTILE:1.65,DIRE:2.2};
const DIMENSION_BY_DOMAIN:Record<string,UnderstandingDimension>={MATTER:'manipulation',SPACE:'navigation',TIME:'causality',MONEY:'economy',LIFE:'systems',DEATH:'anomaly_reasoning',IDENTITY:'social',KNOWLEDGE:'knowledge',OWNERSHIP:'ownership',CAUSALITY:'causality',SOCIAL:'social',ENTROPY:'systems'};
const REWARD_POOL:RegionReward[]=[
 {kind:'PROPERTY',key:'room',label:'A room that remains yours when you leave it.'},{kind:'CAPABILITY',key:'known_destination_move',label:'Known places may be addressed by name.'},{kind:'INTERFACE',key:'memory_confidence',label:'Memory Field gains confidence marks.'},{kind:'RESOURCE',key:'regional_stipend',label:'A modest regional resource allowance.'},{kind:'PRIVILEGE',key:'records_access',label:'Access to local records.'},{kind:'PROPERTY',key:'workbench',label:'A persistent workbench.'},{kind:'CAPABILITY',key:'awkward_carry',label:'Awkward objects become carryable.'},{kind:'INTERFACE',key:'relationship_marks',label:'Known NPC relationships become visible.'},{kind:'PRIVILEGE',key:'after_hours',label:'One institutional facility recognises you after hours.'},{kind:'RESOURCE',key:'route_token',label:'A reusable regional travel token.'},
];

function hashString(value:string){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function seeded(seed:string,index:number,mod:number){return hashString(`${seed}:${index}`)%mod;}
function rewards(seed:string,regionId:string,offset:number,count:number){const start=hashString(`${seed}:${regionId}:${offset}`)%REWARD_POOL.length;return Array.from({length:count},(_,i)=>REWARD_POOL[(start+i*3)%REWARD_POOL.length]!);}
function makeRequirements(domain:string,complexity:number,size:RegionSize,severity:RegionSeverity):ThresholdRequirement[]{const primary=DIMENSION_BY_DOMAIN[domain]??'systems',scale=SIZE_MULT[size]*SEVERITY_MULT[severity]*(1+complexity*.08),dims:[UnderstandingDimension,number][]=[[primary,1],['perception',.72],['navigation',.62],['breadth',.42]];return dims.map(([dimension,weight])=>{const bare=Math.round(5*scale*weight);return {dimension,bare,competent:Math.round(bare*1.65+2),mastery:Math.round(bare*2.55+5)};});}
function makeGoals(regionId:string,size:RegionSize,severity:RegionSeverity,index:number):RegionGoal[]{
 if(regionId==='bellweather')return [
  {id:'bellweather:observe',label:'Inspect Bellweather and identify where records are kept.',kind:'OBSERVE',target:3},
  {id:'bellweather:discover',label:'Learn enough actions to handle and inspect evidence.',kind:'DISCOVER',target:4},
  {id:'bellweather:interact',label:'Question someone about the Registry, ownership, the ledger, or the letter.',kind:'INTERACT',target:2},
  {id:'bellweather:contradiction',label:'Establish that possession and recorded ownership disagree.',kind:'CONTRADICTION',target:0},
 ];
 const scale=SIZE_MULT[size]*SEVERITY_MULT[severity];return [
  {id:`${regionId}:observe`,label:'Establish what is actually here.',kind:'OBSERVE',target:Math.max(2,Math.round(3*scale))},
  {id:`${regionId}:discover`,label:'Demonstrate more than one kind of understanding.',kind:'DISCOVER',target:Math.max(2,Math.round(2.5*scale))},
  {id:`${regionId}:interact`,label:'Obtain a useful response from something capable of regretting it.',kind:'INTERACT',target:Math.max(1,Math.round(1.5*scale))},
  {id:`${regionId}:contradiction`,label:'Find evidence that the local rule is not entirely committed to itself.',kind:'CONTRADICTION',target:index<2?0:1},
 ];
}

export function buildAdventure(seedInput:number|string,directions:readonly DirectionLike[]){const seed=String(seedInput),count=8+(hashString(seed)%9),selected=[ARCHETYPES[0]!,...Array.from({length:count-1},(_,i)=>ARCHETYPES[1+seeded(seed,i,ARCHETYPES.length-1)]!)],unique=[] as typeof ARCHETYPES[number][],seen=new Set<string>();for(const row of [...selected,...ARCHETYPES]){if(!seen.has(row[0])){seen.add(row[0]);unique.push(row);}if(unique.length>=count)break;}const regions:AdventureRegion[]=unique.map((row,index)=>{const [id,name,sizeRaw,severityRaw,domain,contradiction]=row,size=sizeRaw as RegionSize,severity=severityRaw as RegionSeverity,complexity=1+seeded(seed,index+41,9);return {id,name,size,severity,complexity,domain,contradiction,goals:makeGoals(id,size,severity,index),requirements:makeRequirements(domain,complexity,size,severity),rewards:{BARE:rewards(seed,id,0,2),COMPETENT:rewards(seed,id,1,3),MASTERY:rewards(seed,id,2,4)},exits:{}};});if(!directions.length)return {seed,regions,startRegionId:'bellweather'};for(let i=0;i<regions.length-1;i+=1){const direction=directions[i%directions.length]!;regions[i]!.exits[direction.key]=regions[i+1]!.id;if(i>0&&i%3===0){const branch=regions[(i+2)%regions.length]!,branchDirection=directions[(i+1)%directions.length]!;regions[i]!.exits[branchDirection.key]=branch.id;}}return {seed,regions,startRegionId:'bellweather'};}
export function evaluateRegionThreshold(region:AdventureRegion,profile:Partial<UnderstandingProfile>,state:AdventureState):ThresholdGrade{const meets=(grade:'bare'|'competent'|'mastery')=>region.requirements.every(requirement=>(profile[requirement.dimension]??0)>=requirement[grade]),goalRatio=region.goals.length?state.completedGoals/region.goals.length:1;if(meets('mastery')&&goalRatio>=1&&state.visitedLocations>=Math.max(3,Math.round(SIZE_MULT[region.size]*4)))return 'MASTERY';if(meets('competent')&&goalRatio>=.6)return 'COMPETENT';if(meets('bare')&&goalRatio>=.25&&state.visitedLocations>=2)return 'BARE';return 'FAIL';}
export function insufficientThresholdHint(region:AdventureRegion,profile:Partial<UnderstandingProfile>){const deficits=region.requirements.map(requirement=>({dimension:requirement.dimension,gap:requirement.bare-(profile[requirement.dimension]??0)})).filter(row=>row.gap>0).sort((a,b)=>b.gap-a.gap),worst=deficits[0];if(!worst)return 'The region objects for reasons it has declined to document.';const hints:Record<UnderstandingDimension,string>={perception:'You have passed several things without establishing what they were.',navigation:'The boundary appears unconvinced by your relationship with getting places.',manipulation:'You have not demonstrated enough control over ordinary objects.',social:'Other people remain largely theoretical in your record.',economy:'You appear unfamiliar with value changing hands.',production:'The region expects evidence that you can make something become something else.',knowledge:'You have observations. The boundary was hoping for understanding.',institutional:'Paperwork has not yet learned to fear you.',ownership:'Possession and recorded ownership are not yet sufficiently distinct in your behaviour.',causality:'The region expects a firmer relationship with cause and consequence.',systems:'You have operated parts without showing that you recognise a whole.',anomaly_reasoning:'Contradiction remains more surprising to you than useful.',breadth:'Your understanding is impressively narrow.',depth:'You have touched many ideas without seriously inconveniencing any of them.'};return hints[worst.dimension];}
