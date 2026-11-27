// apps/copilot-server/src/hints/engine.ts
//
// The tier selection: ask the fastest tier first, stop at the first that has commands, and when none has, escalate once per room. The tiers are plain functions,
// so the order, the stopping and the escalation are tested without any server, and a tier that throws or hangs is "cannot answer", never a failure.

import { roomKeyOf } from './rules.js';
import type { HintAnswer, HintRoom, HintTier, TierFn, TierResult } from './types.js';

export interface HintEngineDeps {
  learned: TierFn;
  instant: TierFn;
  /** Absent: there is no local-model tier at all. It decides for itself whether it is allowed (instant.ts localTier). */
  local?: TierFn;
  /** Files the escalation (a ticket for Claude or the owner). Called at most once per room per `escalateEveryMs`. Absent: nothing is ever escalated. */
  escalate?: (room: HintRoom, tried: HintTier[]) => Promise<void>;
  now?: () => number;
  /** How long a room stays "already escalated" (default one hour): asking again in the same room must not pile up tickets. */
  escalateEveryMs?: number;
}

export interface HintEngine {
  hint(room: HintRoom, signal?: AbortSignal): Promise<HintAnswer>;
}

async function safely(tier: TierFn, room: HintRoom, signal?: AbortSignal): Promise<TierResult | null> {
  try {
    const result = await tier(room, signal);
    return result !== null && result.commands.length > 0 ? result : null;
  } catch {
    return null;
  }
}

export function createHintEngine(deps: HintEngineDeps): HintEngine {
  const now = deps.now ?? Date.now;
  const every = deps.escalateEveryMs ?? 3_600_000;
  const escalatedAt = new Map<string, number>();

  return {
    async hint(room, signal) {
      const started = now();
      const tried: HintTier[] = [];
      const order: [Exclude<HintTier, 'escalated'>, TierFn | undefined][] = [
        ['learned', deps.learned],
        ['instant', deps.instant],
        ['local', deps.local],
      ];
      for (const [tier, fn] of order) {
        if (fn === undefined || signal?.aborted) continue;
        tried.push(tier);
        const result = await safely(fn, room, signal);
        if (result !== null) return { tier, commands: result.commands, notes: result.notes ?? [], tried, ms: now() - started };
      }

      const key = roomKeyOf(room.title);
      const last = escalatedAt.get(key);
      if (deps.escalate !== undefined && room.title.trim() !== '' && !signal?.aborted && (last === undefined || now() - last >= every)) {
        escalatedAt.set(key, now());
        tried.push('escalated');
        try {
          await deps.escalate(room, [...tried]);
          return { tier: 'escalated', commands: [], notes: ['no tier could answer: a ticket was filed for Claude or the owner'], tried, ms: now() - started };
        } catch {
          escalatedAt.delete(key); // the ticket could not be written: try again next time
          tried.pop(); // and it was not escalated
        }
      }
      return { tier: 'none', commands: [], notes: [], tried, ms: now() - started };
    },
  };
}
