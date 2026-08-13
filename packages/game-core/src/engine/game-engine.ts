import { ACTION_CATEGORY, resolveSemanticInput } from '../commands/parser.js';
import type { CommandResult, EntityView, GameEvent, GameRepository } from '../model.js';
import { helpLine } from '../systems/help.js';

const DISCOVERABLE = new Set(['LOOK','MOVE','TAKE','DROP','OPEN','GIVE','BUY','SELL','READ','HELP','INQUIRE']);
const ev=(type:GameEvent['type'], actorId:string, targetId?:string, locationId?:string, payload?:Record<string,unknown>):GameEvent=>({type,actorId,targetId,locationId,payload,at:new Date()});
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

function similarity(a: string, b: string) {
  const left = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const right = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const shared = new Set([...left].filter((char) => right.includes(char))).size;
  return shared / Math.max(left.length, right.length);
}

function inquiryResponse(subject: EntityView | undefined, subjectText: string, specificity: number, questionKind: string, locationName: string) {
  if (!subject) {
    const unknown = subjectText || 'that';
    return [pick([
      `Nothing immediately present answers to "${unknown}".`,
      `The question was understood. The subject was less cooperative.`,
      `The Server can confirm that asking about ${unknown} has not made ${unknown} easier to locate.`,
    ])];
  }

  const facts = subject.facts?.length ? subject.facts : [`${subject.name} is here.`];
  const contextBonus = subject.locationId ? 0.12 : 0;
  const usefulChance = Math.min(0.72, 0.18 + specificity * 0.42 + contextBonus);
  const roll = Math.random();

  if (roll < usefulChance) {
    const first = pick(facts);
    if (facts.length > 1 && Math.random() < specificity * 0.45) {
      const second = pick(facts.filter((fact) => fact !== first));
      return [first, second];
    }
    return [first];
  }

  if (roll < usefulChance + 0.2) {
    const fact = pick(facts);
    return [pick([
      `Reluctantly: ${fact}`,
      `This is apparently worth confirming: ${fact}`,
      `A mildly useful answer has escaped containment. ${fact}`,
    ])];
  }

  const attitude = [
    `${subject.name} continues to exist despite the interrogation.`,
    `You have successfully asked a ${questionKind.toLowerCase()} question about ${subject.name}.`,
    `${subject.name} is currently in ${locationName}. This was already visually available, but here we are.`,
    `The Server has considered your question about ${subject.name} and retained most of its enthusiasm internally.`,
    `That question was better than several alternatives. The answer remains ${subject.name}.`,
  ];
  return [pick(attitude)];
}

export class GameEngine {
 constructor(private repo:GameRepository){}
 async execute(playerId:string, raw:string):Promise<CommandResult>{
  const actor=await this.repo.getActor(playerId); const semantic=resolveSemanticInput(raw,actor.knownConcepts); const events:GameEvent[]=[]; const lines:string[]=[];
  if (!semantic.verb) return {lines:['You do nothing with remarkable precision.'],events};

  if (semantic.kind === 'PROXIMITY') {
    lines.push(pick([
      `That resembles something in ${semantic.category ?? 'AN UNCLEAR CATEGORY'}. You have not named it correctly.`,
      `The Server files that under ${semantic.category ?? 'something'} provisionally. The wording remains your problem.`,
      `Close enough to be suspicious. Not close enough to work. Category: ${semantic.category ?? 'UNDECIDED'}.`,
    ]));
    return {lines,events};
  }

  if (semantic.kind === 'INQUIRY') {
    const visible=await this.repo.listLocationEntities(actor.locationId); const locationName=await this.repo.getLocationName(actor.locationId); const subjectText=semantic.subject?.trim()??'';
    let subject=visible.find((entity)=>entity.name.toLowerCase()===subjectText.toLowerCase()) ?? visible.find((entity)=>subjectText.toLowerCase().includes(entity.name.toLowerCase()) || entity.name.toLowerCase().includes(subjectText.toLowerCase()));
    if(!subject && subjectText){ const ranked=visible.map((entity)=>({entity,score:similarity(subjectText,entity.name)})).sort((a,b)=>b.score-a.score); if(ranked[0]?.score>=0.48) subject=ranked[0].entity; }
    lines.push(...inquiryResponse(subject,subjectText,semantic.specificity??0.35,semantic.questionKind??'DESCRIBE',locationName));
    return this.finish(playerId,actor.locationId,'INQUIRE',lines,events);
  }

  const cmd=semantic;
  if (cmd.verb==='HELP') { lines.push(helpLine(Date.now())); return this.finish(playerId,actor.locationId,cmd.verb,lines,events); }
  if (cmd.verb==='LOOK') {
    const here=await this.repo.getLocationName(actor.locationId); const entities=await this.repo.listLocationEntities(actor.locationId);
    if(cmd.args.length){ const query=cmd.args.join(' ').replace(/^the\s+/i,''); const target=await this.repo.findVisibleEntity(actor.locationId,query); if(target){lines.push(target.name.toUpperCase(),'');lines.push(...(target.facts?.length?target.facts:[`${target.name} is here.`]));}else lines.push(`You look for ${query}. Nothing obvious answers.`); }
    else { lines.push(here.toUpperCase(),''); if(!entities.length) lines.push('There is nothing obvious here.'); else for(const e of entities.filter(x=>x.id!==playerId)) lines.push(`${e.name} is here.`); }
    events.push(ev('PLAYER_LOOKED',playerId,undefined,actor.locationId)); return this.finish(playerId,actor.locationId,cmd.verb,lines,events);
  }
  if (cmd.verb==='MOVE') {
    if(!cmd.args.length) lines.push('Movement without a destination remains ambitious.'); else { const moved=await this.repo.movePlayer(playerId,cmd.args.join(' ')); if(!moved) lines.push('You cannot currently move there.'); else { lines.push(`You move to ${moved.toName}.`); events.push(ev('PLAYER_MOVED',playerId,undefined,moved.to,{from:moved.from})); } }
    return this.finish(playerId,actor.locationId,cmd.verb,lines,events);
  }
  if (cmd.verb==='TAKE') {
    const target=await this.repo.findVisibleEntity(actor.locationId,cmd.args.join(' ').replace(/^the\s+/i,''));
    if(!target) lines.push('There is no such thing here to take.'); else if(!target.portable) lines.push(`You cannot currently take the ${target.name}.`); else if(await this.repo.takeItem(playerId,target.id)){lines.push(`You take the ${target.name}.`);events.push(ev('ITEM_TAKEN',playerId,target.id,actor.locationId));} else lines.push('That did not become yours.');
    return this.finish(playerId,actor.locationId,cmd.verb,lines,events);
  }
  if (cmd.verb==='DROP') { lines.push(await this.repo.dropItem(playerId,cmd.args.join(' '))?'You drop it.':'You are not currently holding that.'); return this.finish(playerId,actor.locationId,cmd.verb,lines,events); }
  if (cmd.verb==='OPEN') {
    const target=await this.repo.findVisibleEntity(actor.locationId,cmd.args.join(' ').replace(/^the\s+/i,''));
    if(!target) lines.push('There is nothing by that name here.'); else if(!target.openable) lines.push(`The ${target.name} does not appear to participate in opening.`); else if(await this.repo.openEntity(playerId,target.id)){ lines.push(`You open the ${target.name}.`); events.push(ev('DOOR_OPENED',playerId,target.id,actor.locationId)); } else lines.push(`You cannot currently open the ${target.name}.`);
    return this.finish(playerId,actor.locationId,cmd.verb,lines,events);
  }

  const directionalMove=await this.repo.movePlayer(playerId,cmd.raw);
  if(directionalMove){ lines.push(`You move to ${directionalMove.toName}.`); events.push(ev('PLAYER_MOVED',playerId,undefined,directionalMove.to,{from:directionalMove.from,bareDirection:true})); return this.finish(playerId,actor.locationId,'MOVE',lines,events); }

  if (DISCOVERABLE.has(cmd.verb)) lines.push(`You do not know how to ${cmd.verb.toLowerCase()} that yet.`); else lines.push('The world does not currently recognise that as something you can do.');
  return {lines,events};
 }
 private async finish(playerId:string,locationId:string,verb:string,lines:string[],events:GameEvent[]):Promise<CommandResult>{
   let discoveredConcept:string|undefined;
   if(DISCOVERABLE.has(verb) && await this.repo.discoverConcept(playerId,verb)){ discoveredConcept=verb; events.push(ev('PLAYER_DISCOVERED_CONCEPT',playerId,undefined,locationId,{concept:verb,category:ACTION_CATEGORY[verb]})); lines.push('',`CONCEPT DISCOVERED: ${verb}`); }
   const anomaly=await this.repo.tryDesignedAnomalies(events,playerId);
   if(anomaly.claimed){ lines.push('','ANOMALY RETAINED','', 'Something you just did should not have worked.','It will continue working for you.','We will not be explaining what.'); events.push(ev('PLAYER_DISCOVERED_ANOMALY',playerId,anomaly.claimed.id,locationId)); }
   await this.repo.recordEvents(events); return {lines,events,discoveredConcept};
 }
}
