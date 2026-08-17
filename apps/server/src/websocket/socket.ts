import type { FastifyInstance } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { GameEngine } from '@unintended/game-core';
import { ClientCommand } from '@unintended/shared';
import { PostgresGameRepository } from '../repository.js';
import { getSession, redis } from '../auth/session.js';
import { AiOrchestrator } from '../ai/orchestrator.js';
import { completeRelationshipTask, contactNpcNetwork, originForPlayer, socialReach, startRelationshipTask } from '../social.js';
import { readDiary } from '../diary.js';
import { parseServerCommand, runServerFacility } from '../server-facilities.js';

const clients=new Map<string,Set<WebSocket>>();
const relationshipCommand=/^(?:please\s+)?(?:check\s+in\s+(?:on|with)|check\s+on|help|assist|do\s+a\s+favou?r\s+for|run\s+an\s+errand\s+for)\s+(?:the\s+)?(.+)$/i;
const reportBackCommand=/^(?:report\s+back\s+to|complete\s+(?:the\s+)?favou?r\s+for|return\s+to)\s+(?:the\s+)?(.+)$/i;
const contactCommand=/^(?:contact|call|message)\s+(?:the\s+)?(.+?)\s+(?:about|regarding)\s+(.+)$/i;
const claimCommand=/^(?:claim|own|assert\s+ownership\s+(?:of\s+)?)(?:the\s+)?(.+)$/i;
const announceCommand=/^(?:announce|map\s+say|say\s+to\s+(?:the\s+)?map)\s+(.+)$/i;
const diaryCommand=/^read\s+(?:the\s+)?diary(?:\s+of\s+the\s+unintended)?(?:\s+page\s+(\d+))?$/i;
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

   const diaryMatch=text.match(diaryCommand);
   if(diaryMatch){const lines=await readDiary(playerId,Number(diaryMatch[1]??1));return send(ws,{type:'OUTPUT',lines:lines??['You do not possess anything the Server recognises as that diary.'],at:new Date().toISOString()});}

   const serverProbe=parseServerCommand(text);
   if(serverProbe){const lines=await runServerFacility(playerId,serverProbe.facility,serverProbe.arg);return send(ws,{type:'OUTPUT',lines,at:new Date().toISOString()});}

   const announceMatch=text.match(announceCommand);
   if(announceMatch){
    const message=announceMatch[1]!.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,160);if(!message)return send(ws,{type:'OUTPUT',lines:['The announcement contained remarkably little announcement.'],at:new Date().toISOString()});
    const announceKey=`announce:${playerId}:${Math.floor(Date.now()/60000)}`,announceCount=await redis.incr(announceKey);if(announceCount===1)await redis.expire(announceKey,65);if(announceCount>3)return send(ws,{type:'OUTPUT',lines:['The connected Maps have heard enough from you for this minute.'],at:new Date().toISOString()});
    const actor=await repo.getActor(playerId),origin=originForPlayer(playerId);send(ws,{type:'OUTPUT',lines:[`Your statement enters ${origin.name}'s connected network.`],at:new Date().toISOString()});await broadcastSocial(playerId,{type:'SOCIAL',text:`${origin.name} / ${actor.name}: ${message}`,at:new Date().toISOString()},ws);return;
   }

   const contactMatch=text.match(contactCommand);
   if(contactMatch){const contacted=await contactNpcNetwork(playerId,contactMatch[1]!,contactMatch[2]!);if(!contacted.ok){const lines=contacted.reason==='UNKNOWN'?['No NPC by that name is attached to your Origin Map.']:contacted.reason==='COOLDOWN'?[`That relationship has already been used across the network recently.`,`Try again in about ${contacted.remaining} minute${contacted.remaining===1?'':'s'}.`]:[`That relationship does not yet support network contact.`,`Current: ${contacted.level}. Required: ${contacted.required}.`];return send(ws,{type:'OUTPUT',lines,at:new Date().toISOString()});}if(!contacted.npc)return send(ws,{type:'OUTPUT',lines:['The network contact resolved without a person. This is being treated as administrative damage.'],at:new Date().toISOString()});return send(ws,{type:'OUTPUT',lines:[`${contacted.npc.name.toUpperCase()} / NETWORK CONTACT`,contacted.response,`Remote use does not count as relationship maintenance. Cooldown: ${contacted.cooldownMinutes} minutes.`],at:new Date().toISOString()});}

   const claimMatch=text.match(claimCommand);
   if(claimMatch){
    const actor=await repo.getActor(playerId),target=await repo.findAccessibleEntity(playerId,claimMatch[1]!);if(!target?.held)return send(ws,{type:'OUTPUT',lines:['The Server understands the ownership assertion. Possessing the subject first would improve its legal character.'],at:new Date().toISOString()});
    const discovered=await repo.discoverConcept(playerId,'CLAIM'),update=await repo.recordUnderstanding(playerId,'CLAIM',`held:${target.id}`,true);
    const lines=[`You assert that the ${target.name} is yours.`,`The Registry accepts that you possess it. It declines to confirm that possession and ownership are the same thing.`];if(discovered)lines.push('','CONCEPT DISCOVERED: CLAIM');if(update.titleChanged)lines.push('','TITLE REVISED',update.currentTitle,'The Server has updated its estimate of your competence. It appears irritated by the result.');
    await repo.recordEvents([{type:'PLAYER_PROBED_CONCEPT',actorId:playerId,targetId:target.id,locationId:actor.locationId,payload:{concept:'CLAIM',ownershipAssertion:true},at:new Date()}]);send(ws,{type:'OUTPUT',lines,at:new Date().toISOString()});return;
   }

   const reportMatch=text.match(reportBackCommand);
   if(reportMatch){const target=await repo.findPlayerVisibleEntity(playerId,reportMatch[1]!);if(target?.kind!=='NPC')return send(ws,{type:'OUTPUT',lines:['The Server understands the return. The intended person is not here to benefit from it.'],at:new Date().toISOString()});const completed=await completeRelationshipTask(playerId,target.id);if(!completed.ok){const lines=completed.reason==='NONE'?[`${target.name} has no outstanding favour from you.`]:completed.reason==='NOT_DONE'&&completed.task?[`The favour is not complete.`,`You were asked to go to ${completed.task.targetLocationName}, LOOK there, and return.`]:[`${target.name} is not currently available for this conclusion.`];return send(ws,{type:'OUTPUT',lines,at:new Date().toISOString()});}const relationship=completed.relationship;const lines=[`${target.name} accepts that you actually did the small thing you said you would do.`,`Relationship: ${relationship?.level??'RECORDED'}.`];if(relationship?.established)lines.push('History is beginning to do some of the remembering for you.');send(ws,{type:'OUTPUT',lines,at:new Date().toISOString()});return;}

   const relationshipMatch=text.match(relationshipCommand);
   if(relationshipMatch){const target=await repo.findPlayerVisibleEntity(playerId,relationshipMatch[1]!);if(target?.kind!=='NPC')return send(ws,{type:'OUTPUT',lines:['The intended social maintenance is clear. The intended person is not currently available.'],at:new Date().toISOString()});const task=await startRelationshipTask(playerId,target.id);if(!task)return send(ws,{type:'OUTPUT',lines:[`${target.name} is not in a position to delegate ordinary inconvenience at present.`],at:new Date().toISOString()});send(ws,{type:'OUTPUT',lines:[`${target.name} allows you to be useful in a small, unheroic way.`,task.description,'This will count when you return having actually done it.'],at:new Date().toISOString()});return;}

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
