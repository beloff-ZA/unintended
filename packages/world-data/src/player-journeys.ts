import { mapIdentityForMapId } from './map-identities.js';

export type JourneyStage='ARRIVAL'|'DOUBT'|'INVESTIGATION'|'INTERFERENCE'|'AFTERMATH';
export type JourneyEvidence={visited:number;questions:number;handledEvidence:boolean;interference:boolean;anomalyCount:number;serverProbes:number};
export type JourneyView={stage:JourneyStage;title:string;pressure:string;unresolved:string;worldResponse:string;nextQuestion:string};

type JourneyScript={arrival:string;doubt:string;investigation:string;interference:string;aftermath:string;questions:[string,string,string,string,string];relevantItems:string[]};

const SCRIPTS:Record<string,JourneyScript>={
 'possession-registry':{
  arrival:'People here distinguish having something from being recognised as its owner. They do not agree which distinction matters more.',doubt:'The paperwork is not merely inaccurate. People are arranging their lives around it.',investigation:'A chain now exists between an object, a record and somebody inconvenienced by both. One of them is behaving like authority.',interference:'You have stopped merely observing the ownership disagreement and have become part of it.',aftermath:'Bellweather has absorbed your interference without resolving the underlying question. That is more worrying than a clean failure.',questions:['What does this Map treat as proof?','Whose version of ownership creates the real consequence?','Can a record be made false by changing possession?','Who benefits when possession and ownership disagree?','What else has the Registry made true by recording it?'],relevantItems:['item-5','item-10','item-17','item-19']
 },
 'identity-roll':{
  arrival:'Everyone appears to know who everyone is until a name has to survive contact with a record.',doubt:'At least one person is being recognised differently by memory, presence and administration.',investigation:'Witnesses and records have begun forming incompatible versions of the same person.',interference:'Your questions have entered the identity chain. Somebody can now cite you as evidence.',aftermath:'The Roll has not resolved the person. It has merely gained another witness with opinions.',questions:['Who is allowed to identify a person here?','Can two correct witnesses create two people?','What happens to someone the Roll refuses to recognise?','Does changing a name change the person or only their consequences?','Which identities exist only because everyone keeps agreeing?'],relevantItems:['item-5','item-10','item-15','item-17']
 },
 'prior-market':{
  arrival:'Trade looks ordinary until the dates are read in the order they were written.',doubt:'Some obligations are arriving before anyone has done the thing that supposedly created them.',investigation:'A receipt, delivery or debt now has a cause that occurs later than its consequence.',interference:'Your choices have entered a transaction whose paperwork may already know what you decide.',aftermath:'The Market has priced your contradiction and continued trading. This is not the reassurance it thinks it is.',questions:['Can a transaction fail after its receipt already exists?','Who owes whom when the cause comes second?','Can a predicted trade be deliberately refused?','Does destroying evidence alter the obligation?','Who profits from knowing which consequences arrive early?'],relevantItems:['item-5','item-9','item-10','item-17']
 },
 'returning-roads':{
  arrival:'Routes are described with confidence nobody extends to destinations.',doubt:'The journey back is not reliably the inverse of the journey out.',investigation:'Multiple observations now describe a route that remains useful despite disagreeing with itself.',interference:'Your own travel has become part of the survey evidence.',aftermath:'The road still works. The explanation does not. Surveyors consider this a usable result.',questions:['What makes a route repeatable if its destination changes?','Which side of a road decides where return means?','Can two maps both be correct?','Does carrying something change where a route goes?','What was the bridge connecting before anyone surveyed it?'],relevantItems:['item-1','item-12','item-14','item-15']
 },
 'unremembered-archive':{
  arrival:'Records and memory are both treated as evidence here, which would be sensible if they were speaking to each other.',doubt:'Something has been recorded without being remembered, or remembered without having happened officially.',investigation:'Independent evidence now supports incompatible histories of the same event.',interference:'Your observation has created a new record of what may already have lacked one.',aftermath:'The Archive now contains your version too. Agreement has become statistically less likely.',questions:['Can an event exist if nobody remembers it?','Can a memory become evidence after the record disappears?','What changes when a forgotten event is witnessed again?','Which version does the Server remember?','Are missing events old, future, or merely unfiled?'],relevantItems:['item-5','item-10','item-15','item-17']
 },
 'surviving-debts':{
  arrival:'Obligations here tend to survive the circumstances that were supposed to end them.',doubt:'Someone is responsible for something that no longer has a sensible debtor, owner or beneficiary.',investigation:'A debt has persisted across a change that should have made settlement meaningless.',interference:'You have entered the obligation chain and the Office can now point at something you did.',aftermath:'The obligation survived your involvement. It may be attached to a rule rather than a person.',questions:['What exactly can inherit an obligation?','Can a debt exist without a living debtor?','Who benefits from obligations that cannot end?','Can ownership be transferred without transferring responsibility?','What would count as genuinely settled here?'],relevantItems:['item-4','item-5','item-9','item-17']
 }
};

export function journeyRelevantItemTemplates(mapId:string){const identity=mapIdentityForMapId(mapId),script=SCRIPTS[identity.archetypeId]??SCRIPTS['possession-registry']!;return [...script.relevantItems];}
export function journeyFor(mapId:string,e:JourneyEvidence):JourneyView{
 const identity=mapIdentityForMapId(mapId),s=SCRIPTS[identity.archetypeId]??SCRIPTS['possession-registry']!;
 let stage:JourneyStage='ARRIVAL';
 if(e.visited>=2||e.questions>=1)stage='DOUBT';
 if(e.visited>=3&&e.questions>=2&&e.handledEvidence)stage='INVESTIGATION';
 if(e.handledEvidence&&e.interference)stage='INTERFERENCE';
 if(e.anomalyCount>0&&e.visited>=4&&e.questions>=3&&e.handledEvidence)stage='AFTERMATH';
 const idx={ARRIVAL:0,DOUBT:1,INVESTIGATION:2,INTERFERENCE:3,AFTERMATH:4}[stage],pressure={ARRIVAL:s.arrival,DOUBT:s.doubt,INVESTIGATION:s.investigation,INTERFERENCE:s.interference,AFTERMATH:s.aftermath}[stage];
 return {stage,title:identity.title,pressure,unresolved:identity.currentCrisis,worldResponse:pressure,nextQuestion:s.questions[idx]};
}
