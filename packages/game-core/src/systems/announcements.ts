export function incidentAlias(input:{event:string;location?:string;item?:string;day:number}):string {
 const bits=[input.event,input.location??'',input.item??'',String(input.day)].join('|');
 let h=2166136261; for (const c of bits) h=Math.imul(h^c.charCodeAt(0),16777619);
 const a=['Regional','Moist','Visibility','Bakery','Lunar','Bird','Temporary','Administrative'];
 const b=['Coordinator','Steve','Department','Person','Operator','Witness','Dave','Problem'];
 return `${a[Math.abs(h)%a.length]} ${b[Math.abs(h>>>8)%b.length]}`;
}
