// apps/game-client/src/features/chat/chat-unread.ts
//
// The pure rules behind the unread dot on a chat pane tab: one pass over the message list, and which panes
// have a message newer than the user has seen. No state here (see chat-unread-store.ts).
import type { ChatSubtype } from './chat-settings-store';
import type { ChatMessage } from './chat-store';
import { isOwnChatLine } from './chat-display-text';

export type PaneNumbers = Partial<Record<ChatSubtype, number>>;

export interface MessageSummary {
  /** Messages per subtype. Every line counts, your own included, so pane visibility is exactly what it was. */
  counts: Record<string, number>;
  /** The newest message id per subtype. Your own lines are skipped: they are not "new messages". */
  lastIds: PaneNumbers;
  /** The newest id of any message (own lines included), 0 for an empty list. */
  latestId: number;
}

/**
 * Counts per subtype and the newest id per subtype, in ONE pass over the list. The list is unbounded and ChatPane
 * recomputes on every message, so this replaces the pane's own counting loop instead of adding a second pass.
 * Ids are the numeric strings chat-store hands out; a message whose id is not a finite number is counted but cannot
 * be "newer than" anything.
 */
export function summarizeMessages(messages: readonly ChatMessage[]): MessageSummary {
  const counts: Record<string, number> = Object.create(null);
  const lastIds: PaneNumbers = {};
  let latestId = 0;

  for (const m of messages) {
    const id = Number(m.id);
    const hasId = Number.isFinite(id);
    if (hasId && id > latestId) latestId = id;

    const subtype = m.subtype;
    if (!subtype) continue;
    counts[subtype] = (counts[subtype] ?? 0) + 1;

    if (!hasId || isOwnChatLine(m.rawText)) continue;
    if (id > (lastIds[subtype] ?? 0)) lastIds[subtype] = id;
  }

  return { counts, lastIds, latestId };
}

export interface UnreadInput {
  lastIds: PaneNumbers;
  /** The newest id the user has seen on each pane. */
  seen: PaneNumbers;
  /** Messages at or below this id are history: they existed when the feature was armed. */
  baseline: number;
}

/** The panes whose newest message is newer than both the baseline and what the user has seen there. */
export function unreadSubtypes({ lastIds, seen, baseline }: UnreadInput): Set<ChatSubtype> {
  const unread = new Set<ChatSubtype>();
  for (const [subtype, newest] of Object.entries(lastIds) as Array<[ChatSubtype, number]>) {
    if (newest > Math.max(seen[subtype] ?? 0, baseline)) unread.add(subtype);
  }
  return unread;
}
