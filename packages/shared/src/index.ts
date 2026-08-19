import { z } from 'zod';

export const RequestId = z.string().trim().min(1).max(80);
export type RequestId = z.infer<typeof RequestId>;

export const ClientCommand = z.object({
  type: z.literal('COMMAND'),
  text: z.string().trim().min(1).max(240),
  requestId: RequestId.optional(),
});
export type ClientCommand = z.infer<typeof ClientCommand>;

export type WorldMessage =
  | { type: 'OUTPUT'; lines: string[]; at: string; requestId?: string }
  | { type: 'PRESENCE'; text: string; at: string; requestId?: string }
  | { type: 'ANNOUNCEMENT'; title: string; lines: string[]; at: string; requestId?: string }
  | { type: 'STATE'; location: string; nearby: string[]; knownConcepts: string[]; at: string; requestId?: string };
