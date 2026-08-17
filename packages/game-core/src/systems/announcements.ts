function hashBits(value:string){let h=2166136261;for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}

export function incidentAlias(input:{event:string;location?:string;item?:string;day:number}):string {
 const bits=[input.event,input.location??'',input.item??'',String(input.day)].join('|');
 const h=hashBits(bits);
 const a=['Regional','Moist','Visibility','Bakery','Lunar','Bird','Temporary','Administrative'];
 const b=['Coordinator','Steve','Department','Person','Operator','Witness','Dave','Problem'];
 return `${a[h%a.length]} ${b[(h>>>8)%b.length]}`;
}

export function anomalyAlias(input:{seed:number|string;templateId:string}):string{
 const h=hashBits(`${input.seed}|${input.templateId}|unintended-alias`);
 const a=['Unscheduled','Certified','Premium','Emotional','Recursive','Municipal','Forbidden','Suspicious','Executive','Accidental','Deluxe','Administrative'];
 const b=['Goblin','Protocol','Incident','Situation','Narrative','Problem','Exception','Procedure','Moment','Episode','Compliance','Event'];
 const c=['Prime','Plus','Junior','Extended','Professional','Ultimate','Mk II','Final','Again','Official','Pro Max','Director\'s Cut'];
 return `${a[h%a.length]} ${b[(h>>>7)%b.length]} ${c[(h>>>15)%c.length]}`;
}

export const DIARY_DISCOVERY_ALIAS='Supreme Main-Character Lore Goblin Incident FINAL FINAL v7';
