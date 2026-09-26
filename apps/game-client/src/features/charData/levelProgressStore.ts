// apps/game-client/src/features/charData/levelProgressStore.ts
// Tracks how far through the current level the character is, for the compact
// HUD's EXP bar.
//
// GMCP gives us the level (login_data, once per login) and `tnl` — exp REMAINING
// to the next level (char_data, every prompt) — but not the exp SPAN of the
// level, so a fill fraction can't be computed exactly from GMCP alone.
//
// Exact path: the level-progress plugin learns exp-per-level once (from
// `worth`) and announces it on `shatteredarchive:exp-per-level`; that value is
// used as the span (fill = 1 - tnl/span) from the first packet.
//
// Fallback (plugin off, or value not learned yet): the span is the highest tnl
// seen since the last level-up. Known limit of the fallback: logging in
// mid-level starts the bar empty and it only fills from that point, so it
// under-reports until the next level.
//
// name/level normally come ONLY from game:character-login — but that event
// can be missed entirely for a character (confirmed live 2026-09-26: a
// mid-session character switch while GMCP was disabled means the server
// never had a channel to send login_data through, and it does not
// retroactively resend once GMCP is re-enabled). shatteredarchive:score-
// sheet-exp (world-time-and-identity.plugin.ts's `sc`/`score` scan) gives
// the same self-heal applyLogin does, from evidence in a score-sheet reply
// instead — without it, the bar would stay permanently invisible
// (visible requires a known level) for a character login never announced.
//
// Like tickStore/charDataStore this is a module-level singleton that keeps
// listening with no subscribers: a live theme switch unmounts and remounts the
// HUD, and a layout that never renders the bar must not miss a level-up.
import { ListenEvent } from '../event-emitter/event-dispatcher';

export const MAX_LEVEL = 51;

export type LevelProgress = {
  /** Show the bar: level and tnl known, and not already at the max level. */
  visible: boolean;
  /** 0..100 */
  pct: number;
  level: number | null;
  /** Exp remaining to the next level. */
  tnl: number | null;
};

type State = {
  name: string | null;
  level: number | null;
  tnl: number | null;
  span: number;
};

export function computeLevelProgress(level: number | null, tnl: number | null, span: number): LevelProgress {
  const visible = level != null && tnl != null && level < MAX_LEVEL;
  const raw = span > 0 && tnl != null ? ((span - tnl) / span) * 100 : 0;
  return { visible, pct: Math.max(0, Math.min(100, raw)), level, tnl };
}

const initialState = (): State => ({ name: null, level: null, tnl: null, span: 0 });

let state: State = initialState();
let snapshot: LevelProgress = computeLevelProgress(null, null, 0);
const listeners = new Set<() => void>();
let disposers: Array<() => void> = [];
let started = false;

// Exact exp-per-level per character, announced by the level-progress plugin
// (learned once from `worth`). Keyed by name so it doesn't matter whether it
// arrives before or after login_data. When present it beats the high-water
// estimate, which stays as the fallback (plugin off, or value not learned yet).
const exactSpanByName = new Map<string, number>();

function effectiveSpan(): number {
  const exact = state.name !== null ? exactSpanByName.get(state.name) : undefined;
  return exact ?? state.span;
}

function publish(): void {
  const next = computeLevelProgress(state.level, state.tnl, effectiveSpan());
  if (
    next.visible === snapshot.visible &&
    next.pct === snapshot.pct &&
    next.level === snapshot.level &&
    next.tnl === snapshot.tnl
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((fn) => fn());
}

const finiteNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function applyLogin(data: any): void {
  const name = typeof data?.name === 'string' ? data.name : null;
  const level = finiteNumber(data?.level);

  // Same character and nothing new about the level: keep our progress — this
  // covers a re-send of login_data and a reconnect at the same level.
  if (name === state.name && (level === null || level === state.level)) return;

  state = { name, level, tnl: null, span: 0 };
  publish();
}

function start(): void {
  if (started) return;
  started = true;

  // A subscriber that arrives after login_data (e.g. after a layout switch)
  // still gets the level from the same snapshot useCharacterLogin reads.
  try {
    const snap = (window as any).__SA_EVENT_SNAPSHOTS__?.['game:character-login'];
    if (snap) applyLogin(snap);
  } catch {
    // ignore
  }

  disposers = [
    ListenEvent<any>('game:character-login', applyLogin, { key: 'levelProgressStore::game:character-login' }),

    ListenEvent<any>(
      'game:char-data',
      (data) => {
        const tnl = finiteNumber(data?.tnl);
        if (tnl === null) return;
        state.tnl = tnl;
        state.span = Math.max(state.span, tnl);
        publish();
      },
      { key: 'levelProgressStore::game:char-data' },
    ),

    ListenEvent<any>(
      'shatteredarchive:exp-per-level',
      (data) => {
        const name = typeof data?.name === 'string' ? data.name : null;
        if (name === null) return;

        const value = data?.expPerLevel;
        if (value === null) {
          exactSpanByName.delete(name);
        } else {
          const n = finiteNumber(value);
          if (n === null || n <= 0) return; // junk: keep whatever we had
          exactSpanByName.set(name, n);
        }
        publish();
      },
      { key: 'levelProgressStore::shatteredarchive:exp-per-level' },
    ),

    // Same self-heal as applyLogin, but triggered by evidence in a `score`/
    // `sc` reply (world-time-and-identity.plugin.ts) instead of depending on
    // game:character-login having fired at all — confirmed live 2026-09-26:
    // a character switch while GMCP happened to be disabled means
    // login_data never fires for the new character, even after GMCP is
    // re-enabled later (`gmc`) — nothing else would ever tell this store a
    // login happened.
    ListenEvent<any>(
      'shatteredarchive:score-sheet-exp',
      (data) => {
        const name = typeof data?.characterName === 'string' ? data.characterName : null;
        const level = finiteNumber(data?.level);
        if (name === null || level === null) return;

        if (name !== state.name) {
          const tnl = finiteNumber(data?.xpToLevel);
          state = { name, level, tnl, span: tnl ?? 0 };
          publish();
          return;
        }

        if (level !== state.level) {
          // The new level's true span is right here — seed it immediately
          // instead of waiting for the next char_data tick to climb to it.
          const tnl = finiteNumber(data?.xpToLevel);
          state.level = level;
          state.tnl = tnl;
          state.span = tnl ?? 0;
          publish();
        }
      },
      { key: 'levelProgressStore::shatteredarchive:score-sheet-exp' },
    ),

    ListenEvent<any>(
      'event:level-up',
      () => {
        // The next char_data's tnl defines the new level's span. Never invent a
        // level we were never told.
        state.span = 0;
        if (state.level !== null) state.level += 1;
        publish();
      },
      { key: 'levelProgressStore::event:level-up' },
    ),
  ];
}

export function getLevelProgress(): LevelProgress {
  return snapshot;
}

export function subscribeLevelProgress(fn: () => void): () => void {
  start();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test-only: drop listeners and state so cases can't leak into each other. */
export function __resetForTests(): void {
  disposers.forEach((dispose) => {
    try {
      dispose();
    } catch {
      // ignore
    }
  });
  disposers = [];
  started = false;
  listeners.clear();
  exactSpanByName.clear();
  state = initialState();
  snapshot = computeLevelProgress(null, null, 0);
}
