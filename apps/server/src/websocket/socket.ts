import type { FastifyInstance } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { GameEngine } from '@unintended/game-core';
import { ClientCommand } from '@unintended/shared';
import { PostgresGameRepository } from '../repository.js';
import { getSession, redis } from '../auth/session.js';
import { AiOrchestrator } from '../ai/orchestrator.js';
import { originForPlayer, socialReach } from '../social.js';

const clients=new Map<string,Set<WebSocket>>();
const relationshipCommand=/^(?:please\s+)?(?:check\s+in\s+(?:on|with)|check\s+on|help|assist|do\s+a\s+favou?r\s+for|run\s+an\s+errand\s+for)\s+(?:the\s+)?(.+)$/i;
const claimCommand=/^(?:claim|own|assert\s+ownership\s+(?:of\s+)?)(?:the\s+)?(.+)$/i;
const announceCommand=/^(?:announce|map\s+say|say\s+to\s+(?:the\s+)?map)\s+(.+)$/i;
function send(ws:WebSocket,data:unknown){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
async function broadcastSocial(playerId:string,data:unknown,except?:WebSocket){const reach=await socialReach(playerId),visibleMaps=new Set(reach.maps.map(map=>map.id));for(const [recipientId,set] of clients){if(!visibleMaps.has(originForPlayer(recipientId).id))continue;for(const ws of set)if(ws!==except)send(ws,data);}}

export function attachWebSocket(app:FastifyInstance){
 const wss=new WebSocketServer({noServer:true});const repo=new PostgresGameRepository(),engine=new GameEngine(repo),ai=new AiOrchestrator(repo);
 app.server.on('upgrade',async(req,socket,head)=>{if(req.url!=='/ws')return;const cookie=Object.fromEntries((req.headers.cookie??'').split(';').map(x=>x.trim().split('=')));const playerId=await getSession(cookie.session);if(!playerId){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>{(ws as any).playerId=playerId;wss.emit('connection',ws,req);});});
 wss.on('connection',async(ws:WebSocket)=>{const playerId=(ws as any).playerId as string,set=clients.get(playerId)??new Set<WebSocket>();set.add(ws);clients.set(playerId,set);await redis.set(`presence:${playerId}`,'online','EX',120);await broadcastSocial(playerId,{type:'PRESENCE',text:'Someone became locally relevant.',at:new Date().toISOString()},ws);
  ws.on('message',async raw=>{try{
   const bucket=`cmd:${playerId}:${Math.floor(Date.now()/10000)}`,count=await redis.incr(bucket);if(count===1)await redis.expire(bucket,12);if(count>30)return send(ws,{type:'OUTPUT',lines:['The Server has noticed your enthusiasm. Try fewer commands.'],at:new Date().toISOString()});
   const parsed=ClientCommand.safeParse(JSON.parse(raw.toString()));if(!parsed.success)return send(ws,{type:'OUTPUT',lines:['The Server declines to understand that packet.'],at:new Date().toISOString()});
   const text=parsed.data.text.trim();

   const announceMatch=text.match(announceCommand);
   if(announceMatch){
    const message=announceMatch[1]!.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,160);if(!message)return send(ws,{type:'OUTPUT',lines:['The announcement contained remarkably little announcement.'],at:new Date().toISOString()});
    const announceKey=`announce:${playerId}:${Math.floor(Date.now()/60000)}`,announceCount=await redis.incr(announceKey);if(announceCount===1)await redis.expire(announceKey,65);if(announceCount>3)return send(ws,{type:'OUTPUT',lines:['The connected Maps have heard enough from you for this minute.'],at:new Date().toISOString()});
    const actor=await repo.getActor(playerId),origin=originForPlayer(playerId);send(ws,{type:'OUTPUT',lines:[`Your statement enters ${origin.name}'s connected network.`],at:new Date().toISOString()});await broadcastSocial(playerId,{type:'SOCIAL',text:`${origin.name} / ${actor.name}: ${message}`,at:new Date().toISOString()},ws);return;
   }

   const claimMatch=text.match(claimCommand);
   if(claimMatch){
    const actor=await repo.getActor(playerId),target=await repo.findAccessibleEntity(playerId,claimMatch[1]!);if(!target?.held)return send(ws,{type:'OUTPUT',lines:['The Server understands the ownership assertion. Possessing the subject first would improve its legal character.'],at:new Date().toISOString()});
    const discovered=await repo.discoverConcept(playerId,'CLAIM'),update=await repo.recordUnderstanding(playerId,'CLAIM',`held:${target.id}`,true);
    const lines=[`You assert that the ${target.name} is yours.`,`The Registry accepts that you possess it. It declines to confirm that possession and ownership are the same thing.`];if(discovered)lines.push('','CONCEPT DISCOVERED: CLAIM');if(update.titleChanged)lines.push('','TITLE REVISED',update.currentTitle,'The Server has updated its estimate of your competence. It appears irritated by the result.');
    await repo.recordEvents([{type:'PLAYER_PROBED_CONCEPT',actorId:playerId,targetId:target.id,locationId:actor.locationId,payload:{concept:'CLAIM',ownershipAssertion:true},at:new Date()}]);send(ws,{type:'OUTPUT',lines,at:new Date().toISOString()});return;
   }

   const relationshipMatch=text.match(relationshipCommand);
   if(relationshipMatch){const actor=await repo.getActor(playerId),target=await repo.findVisibleEntity(actor.locationId,relationshipMatch[1]!);if(target?.kind!=='NPC')return send(ws,{type:'OUTPUT',lines:['The intended social maintenance is clear. The intended person is not currently available.'],at:new Date().toISOString()});const cooldownKey=`relationship-maintenance:${playerId}:${target.id}`,allowed=await redis.set(cooldownKey,'1','EX',12*60*60,'NX');if(!allowed)return send(ws,{type:'OUTPUT',lines:[`${target.name} remembers the recent effort. Additional proof of acquaintance is not currently required.`],at:new Date().toISOString()});const maintained=await repo.maintainRelationship(playerId,target.id);if(!maintained){await redis.del(cooldownKey);return send(ws,{type:'OUTPUT',lines:[`${target.name} is not in a position to participate in this relationship at present.`],at:new Date().toISOString()});}const lines=[`${target.name} allows you to be useful in a small, unheroic way.`,maintained.task,`Relationship: ${maintained.level}.`];if(maintained.established)lines.push('Routine maintenance is becoming less necessary. History is beginning to do some of the remembering for you.');send(ws,{type:'OUTPUT',lines,at:new Date().toISOString()});return;}

   let result=await engine.execute(playerId,text),interpretedFrom:string|undefined;
   if(result.semantic?.kind==='UNKNOWN'){try{const rewritten=await ai.reinterpretKnown(playerId,text);if(rewritten&&rewritten.toLowerCase()!==text.toLowerCase()){interpretedFrom=rewritten;result=await engine.execute(playerId,rewritten);}}catch{}}
   let lines=result.lines;if(interpretedFrom)lines=[`The Server interpreted that as: ${interpretedFrom}`,...lines];else{try{const augmented=await ai.augment(playerId,text,result);if(augmented?.length)lines=augmented;}catch{}}
   send(ws,{type:'OUTPUT',lines,at:new Date().toISOString()});
   if(result.events.some(event=>['PLAYER_MOVED','ITEM_TAKEN','ITEM_DROPPED','DOOR_OPENED','PLAYER_DISCOVERED_ANOMALY','THRESHOLD_PASSED','MAP_LINKED'].includes(event.type)))await broadcastSocial(playerId,{type:'PRESENCE',text:'Something changed within your connected Maps.',at:new Date().toISOString()},ws);
  }catch{send(ws,{type:'OUTPUT',lines:['Something went wrong. This time it may actually be our fault.'],at:new Date().toISOString()});}});
  ws.on('close',async()=>{set.delete(ws);if(!set.size){clients.delete(playerId);await redis.del(`presence:${playerId}`);}});
 });
 return wss;
}
