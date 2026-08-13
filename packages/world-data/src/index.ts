export const LOCATIONS = [
 {id:'bellweather-square',name:'Bellweather Square',exits:{north:'bakery',east:'registry-steps',south:'market-lane'}},
 {id:'bakery',name:'The Bakery',exits:{south:'bellweather-square'}},
 {id:'market-lane',name:'Market Lane',exits:{north:'bellweather-square',east:'old-bridge'}},
 {id:'old-bridge',name:'The Old Bridge',exits:{west:'market-lane'}},
 {id:'registry-steps',name:'Registry Steps',exits:{west:'bellweather-square'}}
] as const;

export const NPCS = [
 {id:'npc-baker',name:'Baker',locationId:'bakery',job:'baker'},
 {id:'npc-farmer',name:'Farmer',locationId:'market-lane',job:'farmer'},
 {id:'npc-courier',name:'Courier',locationId:'bellweather-square',job:'courier'},
 {id:'npc-clerk',name:'Clerk',locationId:'registry-steps',job:'clerk'},
 {id:'npc-stranger',name:'Strange Person',locationId:'old-bridge',job:'unknown'}
] as const;

export const ITEMS = Array.from({length:20},(_,i)=>({
 id:`item-${i+1}`,
 name:['brass key','apple','loaf of bread','grain sack','ledger','wooden box','iron nail','raincoat','coin','letter','spade','rope','empty bottle','train token','old map','wet stone','receipt','hammer','sign','candle'][i]!,
 locationId:['bellweather-square','market-lane','bakery','market-lane','registry-steps','bakery','old-bridge','bellweather-square','market-lane','registry-steps','market-lane','old-bridge','bakery','bellweather-square','old-bridge','old-bridge','bakery','market-lane','registry-steps','bakery'][i]!,
 portable:i!==18, openable:i===5
}));

export const CONCEPTS=['LOOK','MOVE','TAKE','DROP','OPEN','GIVE','BUY','SELL','READ','HELP'] as const;
export const ANOMALIES=[
 {id:'ownership-after-open',domain:'OWNERSHIP',doorKey:'registry',name:'Deferred Possession',pattern:['ITEM_TAKEN','DOOR_OPENED']},
 {id:'bridge-return',domain:'SPACE',pattern:['PLAYER_MOVED','PLAYER_MOVED']},
 {id:'bread-ledger',domain:'KNOWLEDGE',pattern:['ITEM_TAKEN','PLAYER_LOOKED']},
 {id:'wet-key',domain:'MATTER',pattern:['ITEM_TAKEN','SERVER_EVENT_TRIGGERED']},
 {id:'courier-gap',domain:'CAUSALITY',pattern:['ITEM_DROPPED','PLAYER_MOVED']}
] as const;
export const WORLD_DOORS=[{key:'registry',name:'Registry Office',initiallyOpen:false,unlocksConcepts:['SIGN','OWE','PROMISE']}] as const;
export const PROJECTS=[{id:'repair-bridge',name:'Repair the Old Bridge',requirements:{wood:10,metal:5,labour:20}}] as const;
