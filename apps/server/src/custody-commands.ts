import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { characters } from './db/schema.js';
import { redis } from './auth/session.js';
import { giveItem, resolvePlayerAtSamePlace, stealItem, tradeItems } from './custody.js';

const give=/^(?:give|hand)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/i;
const lend=/^(?:lend|loan)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/i;
const steal=/^(?:steal|take)\s+(?:the\s+)?(.+?)\s+from\s+(.+)$/i;
const offer=/^offer\s+(?:the\s+)?(.+?)\s+to\s+(.+?)\s+for\s+(?:the\s+)?(.+)$/i;
const accept=/^accept\s+trade\s+from\s+(.+)$/i;

function resistedLines(item?:string){return item?[`The ${item} does not accept that change of custody under the present circumstances.`,`The Server declines to explain which circumstances offended it.`]:['The proposed ownership change does not currently resolve.','This may be a social problem, a legal problem, or a you problem.'];}

export async function handleCustodyCommand(playerId:string,text:string):Promise<string[]|null>{
 let match=text.match(give);if(match){const recipient=await resolvePlayerAtSamePlace(playerId,match[2]!);if(!recipient)return ['The intended recipient is not presently close enough for ownership to become their problem.'];const result=await giveItem(playerId,recipient.id,match[1]!,'GIVE');if(!result.ok)return result.reason==='NOT_HELD'?['You do not currently possess that.']:resistedLines(result.item?.name);return [`You give the ${result.item.name} to ${recipient.name}.`,`Ownership changes without requiring a speech.`];}
 match=text.match(lend);if(match){const recipient=await resolvePlayerAtSamePlace(playerId,match[2]!);if(!recipient)return ['The intended borrower is not presently close enough to disappoint you.'];const result=await giveItem(playerId,recipient.id,match[1]!,'LEND');if(!result.ok)return result.reason==='NOT_HELD'?['You do not currently possess that.']:resistedLines(result.item?.name);return [`You lend the ${result.item.name} to ${recipient.name}.`,`The Server has recorded an expectation of return. It has not recorded optimism.`];}
 match=text.match(steal);if(match){const victim=await resolvePlayerAtSamePlace(playerId,match[2]!);if(!victim)return ['Nobody by that description is sufficiently near to be robbed.'];const result=await stealItem(playerId,victim.id,match[1]!);if(!result.ok)return result.reason==='NOT_FOUND'?['The intended property is not available to be stolen from that person.']:resistedLines(result.item?.name);return [`The ${result.item.name} changes hands without permission.`,`The Server records this as custody, not innocence.`];}
 match=text.match(offer);if(match){const recipient=await resolvePlayerAtSamePlace(playerId,match[2]!);if(!recipient)return ['The intended trading partner is not presently here.'];const [actor]=await db.select({name:characters.name}).from(characters).where(eq(characters.id,playerId));const key=`trade-offer:${recipient.id}:${playerId}`;await redis.set(key,JSON.stringify({fromId:playerId,fromName:actor?.name??'Someone',toId:recipient.id,offered:String(match[1]).slice(0,120),wanted:String(match[3]).slice(0,120)}),'EX',300);return [`You offer ${match[1]} to ${recipient.name} for ${match[3]}.`,`The offer will remain embarrassing for five minutes.`];}
 match=text.match(accept);if(match){const sender=await resolvePlayerAtSamePlace(playerId,match[1]!);if(!sender)return ['The supposed trading partner is not here.'];const key=`trade-offer:${playerId}:${sender.id}`,raw=await redis.get(key);if(!raw)return ['There is no current trade offer from that person.'];let payload:{offered:string;wanted:string};try{payload=JSON.parse(raw);}catch{return ['The trade offer has become administratively malformed.'];}const result=await tradeItems(sender.id,playerId,payload.offered,payload.wanted);if(!result.ok)return resistedLines();await redis.del(key);return [`Trade accepted with ${sender.name}.`,`Two ownership records change at once. The Server appears relieved they agreed.`];}
 return null;
}
