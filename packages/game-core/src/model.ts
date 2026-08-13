export type EntityKind = 'PLAYER'|'NPC'|'ITEM'|'LOCATION';
export type Domain = 'MATTER'|'SPACE'|'TIME'|'MONEY'|'LIFE'|'DEATH'|'IDENTITY'|'KNOWLEDGE'|'OWNERSHIP'|'CAUSALITY'|'SOCIAL'|'ENTROPY';
export type EventType =
  'PLAYER_LOOKED'|'PLAYER_MOVED'|'ITEM_TAKEN'|'ITEM_DROPPED'|'ITEM_TRANSFERRED'|'DOOR_OPENED'|
  'PLAYER_DISCOVERED_CONCEPT'|'PLAYER_DISCOVERED_ANOMALY'|'WORLD_DOOR_OPENED'|'SERVER_EVENT_TRIGGERED'|'PROJECT_ADVANCED';

export interface GameEvent { id?: string; type: EventType; actorId: string; targetId?: string; locationId?: string; payload?: Record<string, unknown>; at: Date; }
export interface CommandIntent { verb: string; args: string[]; raw: string; }
export interface ActorView { id:string; name:string; locationId:string; knownConcepts:Set<string>; }
export interface EntityView { id:string; name:string; kind:EntityKind; locationId?:string; portable?:boolean; openable?:boolean; open?:boolean; }
export interface CommandResult { lines:string[]; events:GameEvent[]; discoveredConcept?:string; }

export interface GameRepository {
  getActor(id:string): Promise<ActorView>;
  getLocationName(id:string): Promise<string>;
  listLocationEntities(locationId:string): Promise<EntityView[]>;
  findVisibleEntity(locationId:string, query:string): Promise<EntityView|undefined>;
  movePlayer(playerId:string, destination:string): Promise<{from:string;to:string;toName:string}|null>;
  takeItem(playerId:string,itemId:string): Promise<boolean>;
  dropItem(playerId:string,itemId:string): Promise<boolean>;
  openEntity(playerId:string,entityId:string): Promise<boolean>;
  discoverConcept(playerId:string,concept:string): Promise<boolean>;
  recordEvents(events:GameEvent[]): Promise<void>;
  tryDesignedAnomalies(events:GameEvent[], playerId:string): Promise<{claimed?:{id:string;name?:string;doorKey?:string}; retained?:string[]}>;
}
