// apps/game-client/src/features/chat/chat-unread-store.ts
//
// What the user has already seen, kept at module level (like chat-store and chat-settings-store) so that a ChatPane
// that unmounts and mounts again does not light up the history it already showed. See chat-unread.ts for the rule.
import type { ChatSubtype } from './chat-settings-store';
import type { PaneNumbers } from './chat-unread';

export interface UnreadState {
  /** True while the dot feature is on. Nothing is recorded while it is off. */
  armed: boolean;
  /** The newest message id when the feature was armed: everything up to it is history, never unread. */
  baseline: number;
  /** The newest id the user has seen per pane. */
  seen: Readonly<PaneNumbers>;
}

const OFF: UnreadState = { armed: false, baseline: 0, seen: {} };

let state: UnreadState = OFF;
const subscribers = new Set<(s: UnreadState) => void>();

function set(next: UnreadState): void {
  state = next;
  subscribers.forEach((fn) => fn(state));
}

export function getUnreadState(): UnreadState {
  return state;
}

/**
 * Turn the feature on. The baseline is taken once: arming again while armed changes nothing, so a re-render or a
 * second mount cannot move it forward and swallow a real unread message. Disarm first to start over.
 */
export function armUnread(latestId: number): void {
  if (state.armed) return;
  set({ armed: true, baseline: latestId, seen: {} });
}

/** Turn the feature off and forget what was seen, so switching it on again starts from the then-current history. */
export function disarmUnread(): void {
  if (state === OFF) return;
  set(OFF);
}

/** The user has seen everything up to `id` on this pane (they are on it, or clicked its tab). */
export function markPaneSeen(subtype: ChatSubtype, id: number): void {
  if (!state.armed) return;
  if ((state.seen[subtype] ?? 0) >= id) return;
  set({ ...state, seen: { ...state.seen, [subtype]: id } });
}

export function subscribeUnread(fn: (s: UnreadState) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
