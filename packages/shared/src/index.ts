import { z } from 'zod';

export const ClientCommand = z.object({ type: z.literal('COMMAND'), text: z.string().trim().min(1).max(240) });
export type ClientCommand = z.infer<typeof ClientCommand>;

export type WorldMessage =
  | { type: 'OUTPUT'; lines: string[]; at: string }
  | { type: 'PRESENCE'; text: string; at: string }
  | { type: 'ANNOUNCEMENT'; title: string; lines: string[]; at: string }
  | { type: 'STATE'; location: string; nearby: string[]; knownConcepts: string[]; at: string };
