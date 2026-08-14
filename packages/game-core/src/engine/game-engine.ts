import { ACTION_BY_ID } from '@unintended/world-data';
import { ACTION_CATEGORY, resolveSemanticInput } from '../commands/parser.js';
import type { CommandResult, EntityView, GameEvent, GameRepository } from '../model.js';
import { helpLine } from '../systems/help.js';

const ev=(type:GameEvent['type'], actorId:string, targetId?:string, locationId?:string, payload?:Record<string,unknown>):GameEvent=>({type,actorId,targetId,locationId,payload,at:new Date()});
const pick=<T>(items:readonly T[]):T=>items[Math.floor(Math.random()*items.length)]!;
const normalise=(value:string)=>value.trim().toLowerCase().replace(/[?.!,]+$/g,'').replace(/\s+/g,' ');

function similarity(a:string,b:string){
 const left=a.toLowerCase().replace(/[^a-z0-9]/g,''),right=b.toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!left||!right)return 0;if(left===right)return 1;if(left.includes(right)||right.includes(left))return Math.min(left.length,right.length)/Math.max(left.length,right.length);
 const shared=new Set([...left].filter(char=>right.includes(char))).size;return shared/Math.max(left.length,right.length);
}
function isDiscoverable(verb:string){return verb==='INQUIRE'||ACTION_BY_ID.get(verb)?.discoverable===true;}
function questionSignature(kind:string,subject:string,specificity:number){return `${kind}:${normalise(subject)}:${Math.floor(specificity*4)}`;}
function inquiryResponse(subject:EntityView|undefined,subjectText:string,specificity:number,questionKind:string,locationName:string,repetition:number){
 const penalty=1/(1+Math.max(0,repetition-1)*.8);
 if(!subject){
  const unknown=subjectText||'that';
  const lines=[`Nothing immediately present answers to "${unknown}".`,`The question survived parsing. Its subject did not survive observation.`,`The Server has searched the immediate evidence for ${unknown}. The evidence has declined involvement.`,`You have asked about ${unknown}. This has not caused ${unknown} to become local.`];
  if(repetition>=3)return [pick(lines),'Repeating the same question is now producing mainly statistics. Change the question or the evidence.'];
  return [pick(lines)];
 }
 const facts=subject.facts?.length?subject.facts:[`${subject.name} is here.`];const base=Math.min(.78,.16+specificity*.48+(subject.locationId?.length?0.12:0));const usefulChance=Math.max(.06,base*penalty);const roll=Math.random();
 if(roll<usefulChance){const first=pick(facts);if(facts.length>1&&Math.random()<specificity*.42*penalty){const second=pick(facts.filter(f=>f!==first));return [first,second];}return [first];}
 if(roll<usefulChance+.24*penalty){const fact=pick(facts);return [pick([`Reluctantly: ${fact}`,`A useful statement has escaped containment: ${fact}`,`The Server dislikes rewarding this, but: ${fact}`,`Administrative generosity has occurred: ${fact}`])];}
 const attitudes=[`${subject.name} continues to exist despite the investigation.`,`The Server has considered your ${questionKind.toLowerCase()} question and retained most of the useful answer internally.`,`That question was structurally sound. The answer remains less cooperative.`,`You are asking better questions than the world is currently answering.`,`The Server is not withholding everything. It is merely withholding the part you wanted.`];
 const output=[pick(attitudes)];if(repetition>=2)output.push('Repetition is reducing the Server’s charitable interpretation of this inquiry.');if(repetition>=4)output.push('Try changing what you are asking, not merely the punctuation.');return output;
}
function proximityLines(category:string|undefined,distinct:number,verb:string){
 if(distinct<=1)return [pick([`That belongs suspiciously close to ${category??'something real'}.`,`The Server has filed that under ${category??'UNDECIDED'} provisionally.`,`You are not correct. You are, regrettably, adjacent to correct.`])];
 if(distinct===2)return [`You have now described ${category??'the same idea'} in more than one defensible way.`,`The world appears to use a narrower word than you do.`];
 return [`The Server is tired of pretending you have not understood the idea.`,`CONCEPT INFERRED: ${verb}`];
}
function unsupportedActionLine(verb:string,category:string|undefined){
 const action=verb.toLowerCase().replace(/_/g,' ');
 return pick([`You have named ${action} correctly. Nothing here currently satisfies its requirements.`,`The action ${verb} exists. The present circumstances are declining participation.`,`That is a real ${category??'world'} action. It is not a useful one here, which is a separate problem.`,`The Server recognises ${verb}. Reality has not supplied a valid target or system state.`]);
}

export class GameEngine{
 constructor(private repo:GameRepository){}
 async execute(playerId:string,raw:string):Promise<CommandResult>{
  const actor=await this.repo.getActor(playerId),semantic=resolveSemanticInput(raw,actor.knownConcepts),events:GameEvent[]=[],lines:string[]=[];
  const meta={kind:semantic.kind,verb:semantic.verb,category:semantic.category,confidence:semantic.confidence};
  if(!semantic.verb)return {lines:['You do nothing with remarkable precision.'],events,semantic:meta};

  if(semantic.kind==='PROXIMITY'){
   const surface=semantic.matchedSurface??semantic.surfaceVerb??semantic.raw;const probe=await this.repo.registerSemanticProbe(playerId,semantic.verb,surface);
   events.push(ev('PLAYER_PROBED_CONCEPT',playerId,undefined,actor.locationId,{concept:semantic.verb,surface,distinct:probe.distinct,category:semantic.category}));
   lines.push(...proximityLines(semantic.category,probe.distinct,semantic.verb));
   if(probe.distinct>=3&&isDiscoverable(semantic.verb)&&await this.repo.discoverConcept(playerId,semantic.verb))events.push(ev('PLAYER_DISCOVERED_CONCEPT',playerId,undefined,actor.locationId,{concept:semantic.verb,category:semantic.category,inferred:true}));
   await this.repo.recordUnderstanding(playerId,semantic.verb,`semantic:${surface}`,false);await this.repo.recordEvents(events);
   return {lines,events,discoveredConcept:probe.distinct>=3?semantic.verb:undefined,semantic:meta};
  }

  if(semantic.kind==='INQUIRY'){
   const visible=await this.repo.listLocationEntities(actor.locationId),locationName=await this.repo.getLocationName(actor.locationId),subjectText=semantic.subject?.trim()??'',specificity=semantic.specificity??.35,kind=semantic.questionKind??'DESCRIBE';
   let subject=visible.find(entity=>normalise(entity.name)===normalise(subjectText))??visible.find(entity=>normalise(subjectText).includes(normalise(entity.name))||normalise(entity.name).includes(normalise(subjectText)));
   if(!subject&&subjectText){const ranked=visible.map(entity=>({entity,score:similarity(subjectText,entity.name)})).sort((a,b)=>b.score-a.score);if(ranked[0]?.score>=.48)subject=ranked[0].entity;}
   const signature=questionSignature(kind,subjectText,specificity),repetition=await this.repo.registerInquiry(playerId,signature);
   lines.push(...inquiryResponse(subject,subjectText,specificity,kind,locationName,repetition));events.push(ev('PLAYER_ASKED_QUESTION',playerId,subject?.id,actor.locationId,{signature,repetition,specificity,questionKind:kind}));
   return this.finish(playerId,actor.locationId,'INQUIRE',lines,events,!!subject,`inquiry:${kind}:${subject?.id??normalise(subjectText)}`,meta);
  }

  if(semantic.kind==='UNKNOWN'){
   return {lines:[pick(['The world cannot currently bind that wording to an action. Try describing what you want to change.','The Server recognises this as language. That is the last confident statement it can make about it.','Nothing in the current action model accepts that phrasing. A target, a change, or a better verb would improve matters.','The Server has parsed your confidence. It has not parsed your intention.'])],events,semantic:meta};
  }

  const cmd=semantic;
  if(cmd.verb==='HELP'){lines.push(helpLine(Date.now()));return this.finish(playerId,actor.locationId,cmd.verb,lines,events,true,'help',meta);}
  if(cmd.verb==='LOOK'){
   const here=await this.repo.getLocationName(actor.locationId),entities=await this.repo.listLocationEntities(actor.locationId),exits=await this.repo.listLocationExits(actor.locationId);let success=true;
   if(cmd.args.length){const query=cmd.args.join(' ').replace(/^the\s+/i,''),target=await this.repo.findVisibleEntity(actor.locationId,query);if(target){lines.push(target.name.toUpperCase(),'');lines.push(...(target.facts?.length?target.facts:[`${target.name} is here.`]));}else{lines.push(`You look for ${query}. Nothing obvious answers.`);success=false;}}
   else{lines.push(here.toUpperCase(),'');if(!entities.length)lines.push('There is nothing obvious here.');else for(const entity of entities.filter(x=>x.id!==playerId))lines.push(`${entity.name} is here.`);if(exits.length){lines.push('','Ways that seem to leave:');for(const exit of exits)lines.push(`${exit.shape}  ${exit.label}`);}}
   events.push(ev('PLAYER_LOOKED',playerId,undefined,actor.locationId,{exitKeys:exits.map(exit=>exit.directionKey)}));return this.finish(playerId,actor.locationId,cmd.verb,lines,events,success,`look:${cmd.args.join(' ')||'room'}`,meta);
  }
  if(cmd.verb==='MOVE'){
   if(!cmd.args.length){lines.push('Movement is real. Destination remains a separate administrative requirement.','Looking at the location may reveal how it prefers to be left.');return this.finish(playerId,actor.locationId,cmd.verb,lines,events,false,'move:no-destination',meta);}
   const moved=await this.repo.movePlayer(playerId,cmd.args.join(' '));if(!moved){lines.push(pick(['You cannot currently move there.','The requested movement has no valid route from here.','That destination and this location are not on speaking terms.']));return this.finish(playerId,actor.locationId,cmd.verb,lines,events,false,`move:${normalise(cmd.args.join(' '))}`,meta);}
   lines.push(`You move to ${moved.toName}.`);events.push(ev('PLAYER_MOVED',playerId,undefined,moved.to,{from:moved.from,directionKey:moved.directionKey}));return this.finish(playerId,moved.to,cmd.verb,lines,events,true,`move:${moved.directionKey??moved.to}`,meta);
  }
  if(cmd.verb==='TAKE'){
   const query=cmd.args.join(' ').replace(/^the\s+/i,''),target=await this.repo.findVisibleEntity(actor.locationId,query);
   if(!target){lines.push('There is no such thing here to take. Looking before acquiring remains fashionable.');return this.finish(playerId,actor.locationId,cmd.verb,lines,events,false,`take:${normalise(query)}`,meta);}
   if(!target.portable){lines.push(`The ${target.name} does not look conveniently portable. Exceptions have existed.`);return this.finish(playerId,actor.locationId,cmd.verb,lines,events,false,`take:${target.id}:awkward`,meta);}
   const success=await this.repo.takeItem(playerId,target.id);if(success){lines.push(`You take the ${target.name}.`);events.push(ev('ITEM_TAKEN',playerId,target.id,actor.locationId));}else lines.push('That did not become yours. Ownership has retained legal counsel.');
   return this.finish(playerId,actor.locationId,cmd.verb,lines,events,success,`take:${target.id}`,meta);
  }
  if(cmd.verb==='DROP'){
   const dropped=await this.repo.dropItem(playerId,cmd.args.join(' '));if(dropped){lines.push(`You drop the ${dropped.name}.`);events.push(ev('ITEM_DROPPED',playerId,dropped.id,actor.locationId));}else lines.push('You are not currently holding that. The Server checked, reluctantly.');
   return this.finish(playerId,actor.locationId,cmd.verb,lines,events,!!dropped,`drop:${dropped?.id??normalise(cmd.args.join(' '))}`,meta);
  }
  if(cmd.verb==='OPEN'){
   const query=cmd.args.join(' ').replace(/^the\s+/i,''),target=await this.repo.findVisibleEntity(actor.locationId,query);
   if(!target){lines.push('There is nothing by that name here.');return this.finish(playerId,actor.locationId,cmd.verb,lines,events,false,`open:${normalise(query)}`,meta);}
   if(!target.openable){lines.push(`The ${target.name} does not appear to participate in opening. This is not necessarily a permanent moral position.`);return this.finish(playerId,actor.locationId,cmd.verb,lines,events,false,`open:${target.id}:closed-minded`,meta);}
   const success=await this.repo.openEntity(playerId,target.id);if(success){lines.push(`You open the ${target.name}.`);events.push(ev('DOOR_OPENED',playerId,target.id,actor.locationId));}else lines.push(`You cannot currently open the ${target.name}. It may already have made that decision.`);
   return this.finish(playerId,actor.locationId,cmd.verb,lines,events,success,`open:${target.id}`,meta);
  }

  const directionalMove=await this.repo.movePlayer(playerId,cmd.raw);
  if(directionalMove){lines.push(`You move to ${directionalMove.toName}.`);events.push(ev('PLAYER_MOVED',playerId,undefined,directionalMove.to,{from:directionalMove.from,directionKey:directionalMove.directionKey,bareDirection:true}));return this.finish(playerId,directionalMove.to,'MOVE',lines,events,true,`move:${directionalMove.directionKey??directionalMove.to}`,meta);}

  const action=ACTION_BY_ID.get(cmd.verb);if(action){
   let success=false;const targetText=cmd.args.join(' ').replace(/^the\s+/i,'');
   if(['PERCEPTION','KNOWLEDGE'].includes(action.category)&&targetText){const target=await this.repo.findVisibleEntity(actor.locationId,targetText);if(target){lines.push(target.name.toUpperCase(),'');lines.push(...(target.facts??[`${target.name} is here.`]));success=true;}else lines.push(`You attempt to ${cmd.verb.toLowerCase().replace(/_/g,' ')} ${targetText}. The necessary evidence is not present.`);}
   else if(action.category==='MOVEMENT'&&targetText){const moved=await this.repo.movePlayer(playerId,targetText);if(moved){lines.push(`You ${cmd.verb.toLowerCase().replace(/_/g,' ')} toward ${moved.toName}.`);events.push(ev('PLAYER_MOVED',playerId,undefined,moved.to,{from:moved.from,directionKey:moved.directionKey,action:cmd.verb}));success=true;}else lines.push(unsupportedActionLine(cmd.verb,action.category));}
   else if(action.category==='SOCIAL'&&targetText){const target=await this.repo.findVisibleEntity(actor.locationId,targetText);if(target?.kind==='NPC'){lines.push(`${target.name} acknowledges the attempt with the enthusiasm currently available.`);success=true;}else lines.push(unsupportedActionLine(cmd.verb,action.category));}
   else lines.push(unsupportedActionLine(cmd.verb,action.category));
   return this.finish(playerId,actor.locationId,cmd.verb,lines,events,success,`${cmd.verb.toLowerCase()}:${normalise(targetText)||'context'}`,meta);
  }

  return {lines:['The world does not currently recognise that as something you can do.'],events,semantic:meta};
 }

 private async finish(playerId:string,locationId:string,verb:string,lines:string[],events:GameEvent[],success:boolean,contextKey:string,semantic:CommandResult['semantic']):Promise<CommandResult>{
  let discoveredConcept:string|undefined;
  if(isDiscoverable(verb)&&await this.repo.discoverConcept(playerId,verb)){discoveredConcept=verb;events.push(ev('PLAYER_DISCOVERED_CONCEPT',playerId,undefined,locationId,{concept:verb,category:ACTION_CATEGORY[verb]}));lines.push('',`CONCEPT DISCOVERED: ${verb}`);}
  const anomaly=await this.repo.tryDesignedAnomalies(events,playerId);
  if(anomaly.claimed){lines.push('','ANOMALY RETAINED',anomaly.claimed.name?`${anomaly.claimed.name}.`:'','Something in that sequence should have resolved differently.','The exception is yours now. The Server objects to this arrangement.');events.push(ev('PLAYER_DISCOVERED_ANOMALY',playerId,anomaly.claimed.id,locationId,{retained:anomaly.retained}));}
  const understanding=await this.repo.recordUnderstanding(playerId,verb,contextKey,success,{anomaly:!!anomaly.claimed});
  if(understanding.tierChanged){lines.push('','TITLE REVISED',understanding.currentTitle,'The Server has updated its estimate of your competence. It appears irritated by the result.');events.push(ev('TITLE_CHANGED',playerId,undefined,locationId,{title:understanding.currentTitle}));}
  await this.repo.recordEvents(events);return {lines,events,discoveredConcept,semantic};
 }
}
