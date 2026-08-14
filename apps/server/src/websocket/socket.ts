import type { FastifyInstance } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { GameEngine } from '@unintended/game-core';
import { ClientCommand } from '@unintended/shared';
import { PostgresGameRepository } from '../repository.js';
import { getSession, redis } from '../auth/session.js';
import { AiOrchestrator } from '../ai/orchestrator.js';

const clients=new Map<string,Set<WebSocket>>();
function send(ws:WebSocket,data:unknown){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function broadcast(data:unknown,except?:WebSocket){for(const set of clients.values())for(const ws of set)if(ws!==except)send(ws,data);}

export function attachWebSocket(app:FastifyInstance){
 const wss=new WebSocketServer({noServer:true});const repo=new PostgresGameRepository();const engine=new GameEngine(repo);const ai=new AiOrchestrator(repo);
 app.server.on('upgrade',async(req,socket,head)=>{if(req.url!=='/ws')return;const cookie=Object.fromEntries((req.headers.cookie??'').split(';').map(x=>x.trim().split('=')));const playerId=await getSession(cookie.session);if(!playerId){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>{(ws as any).playerId=playerId;wss.emit('connection',ws,req);});});
 wss.on('connection',async(ws:WebSocket)=>{const playerId=(ws as any).playerId as string;const set=clients.get(playerId)??new Set();set.add(ws);clients.set(playerId,set);await redis.set(`presence:${playerId}`,'online','EX',120);broadcast({type:'PRESENCE',text:'Someone arrived.',at:new Date().toISOString()},ws);
  ws.on('message',async raw=>{try{
   const bucket=`cmd:${playerId}:${Math.floor(Date.now()/10000)}`;const count=await redis.incr(bucket);if(count===1)await redis.expire(bucket,12);if(count>30)return send(ws,{type:'OUTPUT',lines:['The Server has noticed your enthusiasm. Try fewer commands.'],at:new Date().toISOString()});
   const parsed=ClientCommand.safeParse(JSON.parse(raw.toString()));if(!parsed.success)return send(ws,{type:'OUTPUT',lines:['The Server declines to understand that packet.'],at:new Date().toISOString()});
   const result=await engine.execute(playerId,parsed.data.text);let lines=result.lines;
   try{const augmented=await ai.augment(playerId,parsed.data.text,result);if(augmented?.length)lines=augmented;}catch{}
   send(ws,{type:'OUTPUT',lines,at:new Date().toISOString()});
   if(result.events.some(e=>['PLAYER_MOVED','ITEM_TAKEN','ITEM_DROPPED','DOOR_OPENED','PLAYER_DISCOVERED_ANOMALY','THRESHOLD_PASSED'].includes(e.type)))broadcast({type:'PRESENCE',text:'Something changed nearby.',at:new Date().toISOString()},ws);
  }catch{send(ws,{type:'OUTPUT',lines:['Something went wrong. This time it may actually be our fault.'],at:new Date().toISOString()});}});
  ws.on('close',async()=>{set.delete(ws);if(!set.size){clients.delete(playerId);await redis.del(`presence:${playerId}`);}});
 });
 return wss;
}
