import crypto from 'node:crypto'; import Redis from 'ioredis';
const redis=new Redis(process.env.REDIS_URL??'redis://localhost:6379');
export async function createSession(playerId:string){const token=crypto.randomBytes(32).toString('hex'); await redis.set(`session:${token}`,playerId,'EX',60*60*24*7); return token;}
export async function getSession(token?:string){if(!token)return null;return redis.get(`session:${token}`);}
export async function destroySession(token?:string){if(token)await redis.del(`session:${token}`);}
export {redis};
