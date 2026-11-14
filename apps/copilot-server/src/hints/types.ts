// apps/copilot-server/src/hints/types.ts
//
// Hints for what to try in a room, answered by the FASTEST tier that can answer (Phase 42):
//   learned   - what the owner (or Claude in a training session) taught for this room: an exact lookup, instant;
//   instant   - the C# word-list provider behind the `hint` user script (`/api/agent/room-hints`): the room's nouns turned into commands, minus what the logs
//               show the game rejecting; a local HTTP call;
//   local     - the owner's LOCAL model (`hint:ai`, Ollama): slower, off unless allowed, because it loads a model on the GPU;
//   escalated - nothing above answered: a ticket is filed for Claude (or the owner) to answer in a session, and the answer is saved as a learned rule so the
//               same room is answered instantly next time. No hosted API is ever called.

export type HintTier = 'learned' | 'instant' | 'local' | 'escalated';

/** What is known about the room the character stands in. The title is required; everything else sharpens the answer. */
export interface HintRoom {
  title: string;
  /** The room text as printed (ANSI removed). */
  description?: string;
  /** Exit names or letters as the game gave them. */
  exits?: string[];
  sector?: string;
}

/** What one tier found. Null (or no commands) means "I cannot answer", and the next tier is asked. */
export interface TierResult {
  commands: string[];
  /** Short lines for the reader: why, what was struck off, what is known to work. */
  notes?: string[];
}

export type TierFn = (room: HintRoom, signal?: AbortSignal) => Promise<TierResult | null>;

export interface HintAnswer {
  /** The tier that answered; `none` when no tier did (and nothing could be escalated). */
  tier: HintTier | 'none';
  commands: string[];
  notes: string[];
  /** Every tier that was asked, in order. */
  tried: HintTier[];
  /** Milliseconds the whole answer took. */
  ms: number;
}
