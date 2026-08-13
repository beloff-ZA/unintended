import { describe,expect,it } from 'vitest'; import { parseCommand } from '../commands/parser.js'; import { incidentAlias } from '../systems/announcements.js';
describe('parser',()=>{it('normalizes a command',()=>expect(parseCommand('  take   brass key ')).toEqual({verb:'TAKE',args:['brass','key'],raw:'take brass key'}));});
describe('incident aliases',()=>{it('are deterministic for an incident',()=>{const x={event:'rain',location:'bakery',item:'apple',day:7};expect(incidentAlias(x)).toBe(incidentAlias(x));});});
