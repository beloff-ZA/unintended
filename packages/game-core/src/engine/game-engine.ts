import { parseCommand } from '../commands/parser.js';
import type { CommandResult, GameEvent, GameRepository } from '../model.js';
import { helpLine } from '../systems/help.js';

const DISCOVERABLE = new Set(['LOOK','MOVE','TAKE','DROP','OPEN','GIVE','BUY','SELL','READ','HELP']);
const ev=(type:GameEvent['type'], actorId:string, targetId?:string, locationId?:string, payload?:Record<string,unknown>):GameEvent=>({type,actorId,targetId,locationId,payload,at:new Date()});

export class GameEngine {
 constructor(private repo:GameRepository){}
 async execute(playerId:string, raw:string):Promise<CommandResult>{
  const actor=await this.repo.getActor(playerId); const cmd=parseCommand(raw); const events:GameEvent[]=[]; const lines:string[]=[];
  if (!cmd.verb) return {lines:['You do nothing with remarkable precision.'],events};
  if (cmd.verb==='HELP') { lines.push(helpLine(Date.now())); return this.finish(playerId,actor.locationId,cmd.verb,lines,events); }
  if (cmd.verb==='LOOK') {
    const here=await this.repo.getLocationName(actor.locationId); const entities=await this.repo.listLocationEntities(actor.locationId);
    lines.push(here.toUpperCase(),''); if(!entities.length) lines.push('There is nothing obvious here.'); else for(const e of entities.filter(x=>x.id!==playerId)) lines.push(`${e.name}${e.kind==='NPC'?' is here.':' is here.'}`);
    events.push(ev('PLAYER_LOOKED',playerId,undefined,actor.locationId)); return this.finish(playerId,actor.locationId,cmd.verb,lines,events);
  }
  if (cmd.verb==='MOVE') {
    if(!cmd.args.length) lines.push('Movement without a destination remains ambitious.'); else { const moved=await this.repo.movePlayer(playerId,cmd.args.join(' ')); if(!moved) lines.push('You cannot currently move there.'); else { lines.push(`You move to ${moved.toName}.`); events.push(ev('PLAYER_MOVED',playerId,undefined,moved.to,{from:moved.from})); } }
    return this.finish(playerId,actor.locationId,cmd.verb,lines,events);
  }
  if (cmd.verb==='TAKE') {
    const target=await this.repo.findVisibleEntity(actor.locationId,cmd.args.join(' '));
    if(!target) lines.push('There is no such thing here to take.'); else if(!target.portable) lines.push(`You cannot currently take the ${target.name}.`); else if(await this.repo.takeItem(playerId,target.id)){lines.push(`You take the ${target.name}.`);events.push(ev('ITEM_TAKEN',playerId,target.id,actor.locationId));} else lines.push('That did not become yours.');
    return this.finish(playerId,actor.locationId,cmd.verb,lines,events);
  }
  if (cmd.verb==='DROP') { lines.push(await this.repo.dropItem(playerId,cmd.args.join(' '))?'You drop it.':'You are not currently holding that.'); return this.finish(playerId,actor.locationId,cmd.verb,lines,events); }
  if (cmd.verb==='OPEN') {
    const target=await this.repo.findVisibleEntity(actor.locationId,cmd.args.join(' '));
    if(!target) lines.push('There is nothing by that name here.'); else if(!target.openable) lines.push(`The ${target.name} does not appear to participate in opening.`); else if(await this.repo.openEntity(playerId,target.id)){ lines.push(`You open the ${target.name}.`); events.push(ev('DOOR_OPENED',playerId,target.id,actor.locationId)); } else lines.push(`You cannot currently open the ${target.name}.`);
    return this.finish(playerId,actor.locationId,cmd.verb,lines,events);
  }
  if (DISCOVERABLE.has(cmd.verb)) lines.push(`You do not know how to ${cmd.verb.toLowerCase()} that yet.`); else lines.push('The world does not currently recognise that as something you can do.');
  return {lines,events};
 }
 private async finish(playerId:string,locationId:string,verb:string,lines:string[],events:GameEvent[]):Promise<CommandResult>{
   let discoveredConcept:string|undefined;
   if(DISCOVERABLE.has(verb) && await this.repo.discoverConcept(playerId,verb)){ discoveredConcept=verb; events.push(ev('PLAYER_DISCOVERED_CONCEPT',playerId,undefined,locationId,{concept:verb})); lines.push('',`CONCEPT DISCOVERED: ${verb}`); }
   const anomaly=await this.repo.tryDesignedAnomalies(events,playerId);
   if(anomaly.claimed){ lines.push('','ANOMALY RETAINED','', 'Something you just did should not have worked.','It will continue working for you.','We will not be explaining what.'); events.push(ev('PLAYER_DISCOVERED_ANOMALY',playerId,anomaly.claimed.id,locationId)); }
   await this.repo.recordEvents(events); return {lines,events,discoveredConcept};
 }
}
