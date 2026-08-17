export type EntityKind = 'PLAYER'|'NPC'|'ITEM'|'LOCATION';
export type Domain = 'MATTER'|'SPACE'|'TIME'|'MONEY'|'LIFE'|'DEATH'|'IDENTITY'|'KNOWLEDGE'|'OWNERSHIP'|'CAUSALITY'|'SOCIAL'|'ENTROPY';
export type EventType =
  'PLAYER_LOOKED'|'PLAYER_MOVED'|'ITEM_TAKEN'|'ITEM_DROPPED'|'ITEM_TRANSFERRED'|'DOOR_OPENED'|
  'PLAYER_PROBED_CONCEPT'|'PLAYER_ASKED_QUESTION'|'PLAYER_DISCOVERED_CONCEPT'|'PLAYER_DISCOVERED_ANOMALY'|
  'PLAYER_ORIGIN_ASSIGNED'|'RELATIONSHIP_MAINTAINED'|'MAP_LINKED'|
  'WORLD_DOOR_OPENED'|'SERVER_EVENT_TRIGGERED'|'PROJECT_ADVANCED'|'THRESHOLD_PASSED'|'TITLE_CHANGED';

export interface GameEvent { id?: string; type: EventType; actorId: string; targetId?: string; locationId?: string; payload?: Record<string, unknown>; at: Date; }
export interface CommandIntent { verb: string; args: string[]; raw: string; }
export interface ActorView { id:string; name:string; locationId:string; knownConcepts:Set<string>; }
export interface EntityView { id:string; name:string; kind:EntityKind; locationId?:string; portable?:boolean; openable?:boolean; open?:boolean; facts?:string[]; held?:boolean; }
export interface LocationExitView { directionKey:string;shape:string;label:string;destinationId:string;destinationName?:string; }
export interface MoveResult { from:string; to:string; toName:string; directionKey?:string; }
export interface DropResult { id:string; name:string; }
export interface UnderstandingUpdate { currentTitle:string; hiddenTier:number; titleChanged:boolean; tierChanged:boolean; }
export interface RelationshipMaintenanceResult { npcId:string; npcName:string; task:string; familiarity:number; trust:number; level:string; established:boolean; }
export interface CommandResult { lines:string[]; events:GameEvent[]; discoveredConcept?:string; semantic?:{kind:string;verb:string;category?:string;confidence?:number}; }

export interface GameRepository {
  getActor(id:string): Promise<ActorView>;
  getLocationName(id:string): Promise<string>;
  listLocationEntities(locationId:string): Promise<EntityView[]>;
  listPlayerLocationEntities(playerId:string): Promise<EntityView[]>;
  listAccessibleEntities(playerId:string): Promise<EntityView[]>;
  listLocationExits(locationId:string): Promise<LocationExitView[]>;
  findVisibleEntity(locationId:string, query:string): Promise<EntityView|undefined>;
  findPlayerVisibleEntity(playerId:string, query:string): Promise<EntityView|undefined>;
  findAccessibleEntity(playerId:string, query:string): Promise<EntityView|undefined>;
  getPreviousLocation(playerId:string): Promise<{id:string;name:string}|null>;
  movePlayer(playerId:string, destination:string): Promise<MoveResult|null>;
  takeItem(playerId:string,itemId:string): Promise<boolean>;
  dropItem(playerId:string,itemId:string): Promise<DropResult|null>;
  openEntity(playerId:string,entityId:string): Promise<boolean>;
  maintainRelationship(playerId:string,npcId:string): Promise<RelationshipMaintenanceResult|null>;
  discoverConcept(playerId:string,concept:string): Promise<boolean>;
  registerSemanticProbe(playerId:string,concept:string,surface:string): Promise<{distinct:number;hintLevel:number}>;
  registerInquiry(playerId:string,signature:string): Promise<number>;
  registerFailure(playerId:string,family:string): Promise<number>;
  recordUnderstanding(playerId:string,actionId:string,contextKey:string,success:boolean,extras?:{anomaly?:boolean;thresholdGrade?:'BARE'|'COMPETENT'|'MASTERY'}): Promise<UnderstandingUpdate>;
  recordEvents(events:GameEvent[]): Promise<void>;
  tryDesignedAnomalies(events:GameEvent[], playerId:string): Promise<{claimed?:{id:string;name?:string;doorKey?:string}; retained?:string[]}>;
}
