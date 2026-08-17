import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { characters, users, serverEventUsage, worldEvents, worldFlags } from '../db/schema.js';
import { createSession, destroySession, getSession, redis } from '../auth/session.js';
import { incidentAlias } from '@unintended/game-core';
import { buildPlayerState } from '../player-state.js';
import { ensureOriginAssigned } from '../social.js';

export async function apiRoutes(app:FastifyInstance){
 app.get('/api/health',async()=>({ok:true,service:'unintended'}));
 app.post('/api/auth/register',async(req,reply)=>{const {email,password,name}=req.body as any;if(!email||!password||!name)return reply.code(400).send({error:'Missing fields'});const passwordHash=await argon2.hash(password);const [u]=await db.insert(users).values({email:String(email).toLowerCase(),passwordHash}).returning();const [c]=await db.insert(characters).values({userId:u.id,name}).returning();await ensureOriginAssigned(c.id);const token=await createSession(c.id);reply.setCookie('session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'});return {player:{id:c.id,name:c.name}};});
 app.post('/api/auth/login',async(req,reply)=>{const {email,password}=req.body as any;const [u]=await db.select().from(users).where(eq(users.email,String(email).toLowerCase()));if(!u?.passwordHash||!await argon2.verify(u.passwordHash,password))return reply.code(401).send({error:'Invalid credentials'});const [c]=await db.select().from(characters).where(eq(characters.userId,u.id));await ensureOriginAssigned(c.id);const token=await createSession(c.id);reply.setCookie('session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'});return {player:{id:c.id,name:c.name}};});
 app.post('/api/auth/logout',async(req,reply)=>{await destroySession(req.cookies.session);reply.clearCookie('session',{path:'/'});return {ok:true};});
 app.get('/api/me',async(req,reply)=>{const id=await getSession(req.cookies.session);if(!id)return reply.code(401).send({error:'Unauthenticated'});await ensureOriginAssigned(id);const state=await buildPlayerState(id);if(!state)return reply.code(404).send({error:'Player missing'});return state;});
 const toys=new Set(['weather','time','wind','moon','sun','lights','birds','doors','bell']);
 app.post('/api/server-toys/:command',async(req,reply)=>{
  const playerId=await getSession(req.cookies.session); if(!playerId)return reply.code(401).send({error:'Unauthenticated'});
  const command=String((req.params as any).command).toLowerCase(); if(!toys.has(command))return reply.code(404).send({error:'No such facility'});
  const rate=await redis.incr(`toy:${playerId}:${Math.floor(Date.now()/60000)}`); if(rate===1)await redis.expire(`toy:${playerId}:${Math.floor(Date.now()/60000)}`,65); if(rate>5)return reply.code(429).send({error:'The Server is busy regretting previous permissions.'});
  const [c]=await db.select().from(characters).where(eq(characters.id,playerId)); const alias=incidentAlias({event:command,location:c?.locationId,day:Math.floor(Date.now()/86400000)});
  if(command==='weather')await db.insert(worldFlags).values({key:'weather',value:{kind:'rain',until:new Date(Date.now()+10*60_000).toISOString()}}).onConflictDoUpdate({target:worldFlags.key,set:{value:{kind:'rain',until:new Date(Date.now()+10*60_000).toISOString()}}});
  await db.insert(serverEventUsage).values({event:command,incidentAlias:alias,actorId:playerId}); await db.insert(worldEvents).values({type:'SERVER_EVENT_TRIGGERED',actorId:playerId,locationId:c?.locationId,payload:{command,incidentAlias:alias}});
  return {ok:true,incidentAlias:alias,effect:command==='weather'?'Temporary rain':'A limited global event occurred.'};
 });
 if(process.env.DEV_AUTH==='true')app.post('/api/dev/login/:slot',async(req,reply)=>{const slot=Number((req.params as any).slot)||1;const email=`dev${slot}@unintended.local`;let [u]=await db.select().from(users).where(eq(users.email,email));if(!u)[u]=await db.insert(users).values({email}).returning();let [c]=await db.select().from(characters).where(eq(characters.userId,u.id));if(!c)[c]=await db.insert(characters).values({userId:u.id,name:`Tester ${slot}`}).returning();await ensureOriginAssigned(c.id);const token=await createSession(c.id);reply.setCookie('session',token,{httpOnly:true,sameSite:'lax',path:'/'});return {player:{id:c.id,name:c.name}};});
}
