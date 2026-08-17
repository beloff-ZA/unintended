import { describe,expect,it } from 'vitest';
import { actionCatalogStats, applyUnderstandingEvidence, assessRetainableException, buildAdventure, buildWorld, EMPTY_UNDERSTANDING } from '@unintended/world-data';
import { parseCommand, resolveSemanticInput } from '../commands/parser.js';
import { incidentAlias } from '../systems/announcements.js';

describe('grammar',()=>{
 it('normalizes a command',()=>expect(parseCommand('  take   brass key ')).toEqual({verb:'TAKE',args:['brass','key'],raw:'take brass key'}));
 it('understands room-scale natural language',()=>expect(resolveSemanticInput('look around me',new Set()).verb).toBe('LOOK'));
 it('understands conversational questions',()=>{const result=resolveSemanticInput('ask courier about the registry',new Set());expect(result.kind).toBe('INQUIRY');expect(result.subject?.toLowerCase()).toBe('courier');});
 it('normalizes movement grammar for known movement',()=>{const result=resolveSemanticInput('go to the registry',new Set(['MOVE']));expect(result.verb).toBe('MOVE');expect(result.args.join(' ')).toBe('the registry');});
});

describe('world simulation',()=>{
 it('keeps generated physical worlds small, connected and non-cardinal',()=>{for(let seed=1;seed<=250;seed+=1){const world=buildWorld(seed);expect(world.directions.length).toBeGreaterThanOrEqual(3);expect(world.directions.length).toBeLessThanOrEqual(9);expect(new Set(world.directions.map(direction=>direction.label)).size).toBe(world.directions.length);const seen=new Set<string>(['bellweather-square']),queue=['bellweather-square'],byId=new Map(world.locations.map(location=>[location.id,location]));while(queue.length){const current=byId.get(queue.shift()!);if(!current)continue;for(const next of Object.values(current.exits))if(!seen.has(next)){seen.add(next);queue.push(next);}}expect(seen.size).toBe(world.locations.length);}});
 it('keeps every generated adventure reachable from Bellweather',()=>{for(let seed=1;seed<=250;seed+=1){const world=buildWorld(seed),adventure=buildAdventure(seed,world.directions);expect(adventure.regions.length).toBeGreaterThanOrEqual(8);expect(adventure.regions.length).toBeLessThanOrEqual(16);const byId=new Map(adventure.regions.map(region=>[region.id,region])),seen=new Set<string>([adventure.startRegionId]),queue=[adventure.startRegionId];while(queue.length){const region=byId.get(queue.shift()!);if(!region)continue;for(const next of Object.values(region.exits))if(!seen.has(next)){seen.add(next);queue.push(next);}}expect(seen.size).toBe(adventure.regions.length);}});
});

describe('progression safeguards',()=>{
 it('rewards varied context more than repetition',()=>{const first=applyUnderstandingEvidence(EMPTY_UNDERSTANDING,{actionId:'LOOK',contextKey:'room:a',success:true,distinctContextOrdinal:1});const second=applyUnderstandingEvidence(first,{actionId:'LOOK',contextKey:'room:b',success:true,distinctContextOrdinal:2});const firstGain=first.perception,secondGain=second.perception-first.perception;expect(firstGain).toBeGreaterThan(secondGain);expect(secondGain).toBeGreaterThan(0);});
 it('keeps the authored ontology broad without exact surface collisions',()=>{const stats=actionCatalogStats();expect(stats.actions).toBeGreaterThan(100);expect(stats.surfaces).toBeGreaterThan(stats.actions);expect(stats.exactSurfaceCollisions).toBe(0);});
});

describe('retained exception policy',()=>{
 it('retains bounded player-scoped server-authoritative powers',()=>expect(assessRetainableException({serverAuthoritative:true,singlePlayerScope:true,boundedUses:true,reversible:true,createsUniqueItems:false,createsCurrency:false,changesOtherPlayersState:false,affectsSecurityOrAdministration:false,unboundedComputeOrNetwork:false}).disposition).toBe('RETAIN'));
 it('patches security-boundary effects regardless of novelty',()=>expect(assessRetainableException({serverAuthoritative:true,singlePlayerScope:true,boundedUses:true,reversible:true,createsUniqueItems:false,createsCurrency:false,changesOtherPlayersState:false,affectsSecurityOrAdministration:true,unboundedComputeOrNetwork:false}).disposition).toBe('PATCH'));
 it('constrains interesting powers that are safe but currently unbounded',()=>expect(assessRetainableException({serverAuthoritative:true,singlePlayerScope:true,boundedUses:false,reversible:true,createsUniqueItems:false,createsCurrency:false,changesOtherPlayersState:false,affectsSecurityOrAdministration:false,unboundedComputeOrNetwork:false}).disposition).toBe('CONSTRAIN'));
});

describe('incident aliases',()=>{it('are deterministic for an incident',()=>{const x={event:'rain',location:'bakery',item:'apple',day:7};expect(incidentAlias(x)).toBe(incidentAlias(x));});});