import type { CommandIntent } from '../model.js';

export function parseCommand(raw:string): CommandIntent {
  const clean = raw.trim().replace(/\s+/g,' ');
  const [verb='', ...args] = clean.split(' ');
  return { verb: verb.toUpperCase(), args, raw: clean };
}
