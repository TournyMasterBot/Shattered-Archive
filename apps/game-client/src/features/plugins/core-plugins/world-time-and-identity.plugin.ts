// apps\game-client\src\features\plugins\core-plugins\world-time-and-identity.plugin.ts
import type { IPluginModule, PluginEvent, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';
import { DispatchEvent } from '../../event-emitter/event-dispatcher';

/**
 * Moved out of userScriptRuntime.ts's hot path (every raw-data line, for
 * every user, regardless of theme) — this plugin is opt-in, auto-enabled by
 * the slate-amber theme (features/hudLayout/themeRegistry.ts's onActivate),
 * and independently toggleable for a default-theme user who wants the same
 * badges without switching themes. Writes to the SAME window globals/events
 * the old hot-path code did (window.__SA_IDENTITY__ / __SA_WORLD_TIME__,
 * shatteredarchive:identity-updated / -world-time-updated), so
 * useCharacterIdentity / useWorldTimePeriod need no changes.
 *
 * The score-sheet scan is NOT a perpetual per-line matcher: it only runs
 * inside a one-shot window armed by the player's OWN `sc`/`score` input
 * (onAlias), satisfied by the first score-sheet chunk or expired after 20s —
 * the same "capture once, rearmed by evidence" shape as level-progress.
 * plugin.ts's `worth` fetch, not content-sniffing every incoming chunk for
 * "Race"/"Class"/"LEVEL" regardless of what command produced it.
 */

// ---- Identity: score-sheet race/class ------------------------------------
// characterName comes from GMCP login_data (userScriptRuntime.ts, unrelated
// to this plugin). raceName/className have no GMCP equivalent — only the
// `score`/`sc` command's plain-text output carries them.

type IdentitySnapshot = {
  characterName?: string;
  raceName?: string;
  className?: string;
  updatedAt?: number;
};

function getIdentitySnapshot(): IdentitySnapshot {
  const w = window as any;
  w.__SA_IDENTITY__ = w.__SA_IDENTITY__ || {};
  return w.__SA_IDENTITY__ as IdentitySnapshot;
}

// Read-only peek that does NOT lazily create __SA_IDENTITY__ — unlike
// getIdentitySnapshot(), used to gate the scan below without a side effect
// on every raw-data/login event before anything has ever been captured.
function peekIdentitySnapshot(): IdentitySnapshot | undefined {
  return (window as any).__SA_IDENTITY__;
}

function setIdentitySnapshot(patch: Partial<IdentitySnapshot>): void {
  const w = window as any;
  const cur = getIdentitySnapshot();
  const next: IdentitySnapshot = { ...cur, ...patch, updatedAt: Date.now() };
  w.__SA_IDENTITY__ = next;
  DispatchEvent('shatteredarchive:identity-updated', next);
}

// Matches the `score`/`sc` command's two-column layout, e.g. (real capture,
// GameLog-DSL_2023-05-08-Mon.txt, an example character just after a reclass):
//   LEVEL: 25          Race : Arboren           Played: 26 hours
//   YEARS: 18          Class: Ranger            Log In: Mon May  8 07:01:54 2023
//   ...
//   XP   : 25153728        Move: 250   of   250    Sounds   ( )
//   XP To Level: 846272
// (XP To Level is absent at max level — there's no next level to cost exp.)
const SCORE_RACE_LINE_RE = /^LEVEL\s*:\s*(\d+)\s+Race\s*:\s*(.+?)\s{2,}Played/i;
const SCORE_CLASS_LINE_RE = /^YEARS\s*:\s*\d+\s+Class\s*:\s*(.+?)\s{2,}Log In/i;
const SCORE_XP_RE = /^XP\s*:\s*([\d,]+)\s+Move/i;
const SCORE_XP_TO_LEVEL_RE = /^XP To Level\s*:\s*([\d,]+)/i;

// First line of the score sheet, e.g. "Score for NewChar Fenor, Strength of
// -=Raije=-" or "Score for TestChar, Amethyst breeze." (both real captures,
// names swapped for placeholders) — only the FIRST word after "for" is
// captured, matching GMCP login_data's single-word name convention (the
// score sheet's header can carry a decorative surname — "NewChar Fenor" —
// that login_data never does).
const SCORE_NAME_LINE_RE = /^Score for ([\w'-]+)/i;

const toInt = (digits: string): number => Number(digits.replace(/,/g, ''));

// One-shot timer mirroring level-progress.plugin.ts's `worth` fetch: armed
// only by the player's OWN `sc`/`score` input (onAlias below), satisfied by
// the first score-sheet chunk that arrives while armed or expired after this
// window — never a perpetual per-line scan. 20s for the same reason as
// worth's fetch timeout: room for a busy connection, not a guess at reply
// latency (score's own reply is normally near-instant).
const SCORE_ARM_MS = 20_000;

// Fast gate mirroring probe-opponent-condition.ts's OPPONENT_GATES: a plain
// substring check, before any ANSI-stripping, splitting, or regex runs —
// cheap insurance against unrelated text arriving inside the armed window
// (e.g. combat spam interleaved before the actual reply), not the primary
// gate (that's scoreArmed). Shared by both scans below — XP/XP To Level only
// ever appear in the same score-sheet chunk as LEVEL/Race/Class, never in
// `worth`'s differently-worded block (Exp Total/Exp to Level, no Race/Class/
// LEVEL at all), so no extra keyword needed.
const SCORE_GATE_KEYWORDS = ['Race', 'Class', 'LEVEL'];

function scoreSheetGate(rawText: string): string | null {
  for (let i = 0; i < SCORE_GATE_KEYWORDS.length; i++) {
    if (rawText.indexOf(SCORE_GATE_KEYWORDS[i]) !== -1) return stripAnsi(rawText);
  }
  return null;
}

// Cross-checks the score sheet's OWN name against the cached identity and
// rearms (clears raceName/className) on a mismatch — the SAME rearm
// game:character-login normally does, but triggered by evidence in the
// reply itself rather than depending on that event having fired at all.
// This is what makes sc/score self-sufficient when login_data is missed —
// confirmed against a real capture, GameLog-DSL 2026-09-26: a player quit
// one character and logged into a second (different) character within the
// SAME connection while GMCP happened to be disabled; login_data never
// re-fired for the new character for the rest of the session (re-enabling
// GMCP via `gmc` later does not retroactively resend it), so without this
// check every later sc/score would have kept reporting the OLD character's
// stale race/class/name.
function scanForScoreSheetName(plain: string): void {
  const match = plain.match(SCORE_NAME_LINE_RE);
  if (!match) return;

  const name = match[1];
  if (peekIdentitySnapshot()?.characterName === name) return; // already known — nothing to do

  setIdentitySnapshot({ characterName: name, raceName: undefined, className: undefined });
}

function scanForScoreSheetIdentity(plain: string): void {
  for (const rawLine of plain.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const raceMatch = line.match(SCORE_RACE_LINE_RE);
    if (raceMatch) {
      setIdentitySnapshot({ raceName: raceMatch[2].trim() });
      continue;
    }

    const classMatch = line.match(SCORE_CLASS_LINE_RE);
    if (classMatch) {
      setIdentitySnapshot({ className: classMatch[1].trim() });
    }
  }
}

// Unlike race/class (fixed until a reclass), XP changes on every kill — so
// this is NOT capture-once/rearmed-on-login like scanForScoreSheetIdentity;
// it runs on every score sheet, giving level-progress.plugin.ts a free,
// self-contained (level, xp, xpToLevel) triple — from the SAME command, so
// no cross-source staleness — every time the player happens to run
// `score`/`sc`, the "different sources" half of learning exp-per-level that
// the always-armed `worth` fetch alone doesn't cover.
function scanForScoreSheetExp(plain: string): void {
  let level: number | null = null;
  let xp: number | null = null;
  let xpToLevel: number | null = null;

  for (const rawLine of plain.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const levelMatch = line.match(SCORE_RACE_LINE_RE);
    if (levelMatch) {
      level = toInt(levelMatch[1]);
      continue;
    }

    const xpMatch = line.match(SCORE_XP_RE);
    if (xpMatch) {
      xp = toInt(xpMatch[1]);
      continue;
    }

    const xpToLevelMatch = line.match(SCORE_XP_TO_LEVEL_RE);
    if (xpToLevelMatch) {
      xpToLevel = toInt(xpToLevelMatch[1]);
    }
  }

  // XP To Level is absent at max level (nothing to report) — not an error,
  // just nothing to announce this time.
  if (level === null || xp === null || xpToLevel === null) return;

  DispatchEvent('shatteredarchive:score-sheet-exp', {
    characterName: peekIdentitySnapshot()?.characterName ?? null,
    level,
    xp,
    xpToLevel,
  });
}

// ---- World time-of-day: derived from the GMCP tick clock ------------------
// Verified against the real game-log corpus (see .ai-plans/
// 20260920-0005-hud-theme-engine.md's Step 5 entry): "The sun rises in the
// east." and "The sun slowly disappears in the west." each fire on the SAME
// tick event as, respectively, {"time":"7:00am"} and {"time":"7:00pm"} —
// consistently, across every session checked. No regex needed for this
// half at all: the GMCP time field is already structured data.

export type WorldTimePeriod = 'Dawn' | 'Day Time' | 'Dusk' | 'Night Time';

type WorldTimeSnapshot = {
  period?: string;
  updatedAt?: number;
};

function setWorldTimeSnapshot(patch: Partial<WorldTimeSnapshot>): void {
  const w = window as any;
  const cur = (w.__SA_WORLD_TIME__ || {}) as WorldTimeSnapshot;
  const next: WorldTimeSnapshot = { ...cur, ...patch, updatedAt: Date.now() };
  w.__SA_WORLD_TIME__ = next;
  DispatchEvent('shatteredarchive:world-time-updated', next);
}

const TIME_RE = /^(\d{1,2}):(\d{2})(am|pm)$/i;

// Dawn/Dusk are each exactly one hour before their anchor (sunrise 7:00am,
// sunset 7:00pm) — boundaries in minutes-since-midnight, half-open [start, end).
const DAWN_START = 6 * 60; // 6:00am
const DAY_START = 7 * 60; // 7:00am
const DUSK_START = 18 * 60; // 6:00pm
const NIGHT_START = 19 * 60; // 7:00pm

export function timeStringToPeriod(time: string): WorldTimePeriod | null {
  const match = TIME_RE.exec(time.trim());
  if (!match) return null;

  let hour = parseInt(match[1], 10) % 12;
  const minute = parseInt(match[2], 10);
  if (match[3].toLowerCase() === 'pm') hour += 12;

  const minutesSinceMidnight = hour * 60 + minute;

  if (minutesSinceMidnight >= DAWN_START && minutesSinceMidnight < DAY_START) return 'Dawn';
  if (minutesSinceMidnight >= DAY_START && minutesSinceMidnight < DUSK_START) return 'Day Time';
  if (minutesSinceMidnight >= DUSK_START && minutesSinceMidnight < NIGHT_START) return 'Dusk';
  return 'Night Time'; // wraps midnight: [7:00pm, 6:00am)
}

export function createWorldTimeAndIdentityPlugin(): IPluginModule {
  // Shared by onAlias/onEnable (arm) and onEvent (checks/disarms) below — a
  // factory-scoped closure, not module-level, so each enable gets its own timer.
  let scoreArmed = false;
  let scoreTimerId: ReturnType<typeof setTimeout> | null = null;

  const disarmScore = () => {
    scoreArmed = false;
    if (scoreTimerId !== null) {
      clearTimeout(scoreTimerId);
      scoreTimerId = null;
    }
  };

  const armScore = () => {
    scoreArmed = true;
    if (scoreTimerId !== null) clearTimeout(scoreTimerId);
    scoreTimerId = setTimeout(disarmScore, SCORE_ARM_MS);
  };

  return {
    manifest: {
      id: 'world-time-and-identity',
      name: 'World Time & Identity',
      version: '0.1.0',
      description:
        'Derives a Dawn/Day/Dusk/Night period from the game tick clock, and reads name/race/class/level/XP off the score sheet after you run `sc`/`score` — powers the compact HUD\'s time-of-day icon and character glyph, and feeds the Level Progress plugin a free exp-per-level reading every time you check your score. Self-corrects from the score sheet alone if a character switch is ever missed (e.g. GMCP was off mid-switch and login_data never re-fires), not just on a normal login. Off by default for everyone else; the Slate & Amber theme turns it on automatically.',
    },

    // Arms the score-sheet scan below — never consumes the command (returns
    // undefined), matching text-to-speech.plugin.ts's command-gate onAlias:
    // this is an observer, not an interceptor.
    onAlias(_api: PluginRuntimeApi, input: string): undefined {
      const trimmed = input.trim().toLowerCase();
      if (trimmed !== 'sc' && trimmed !== 'score') return undefined;

      armScore();
      return undefined;
    },

    // ALSO arms on shatteredarchive:command-sent, not just onAlias: a plugin
    // calling api.sendCommand('score') (e.g. level-progress.plugin.ts's
    // "Check score" action) goes straight to the websocket and never touches
    // the alias pipeline onAlias hooks into, but useGameConnection.ts's
    // sendTelnetData dispatches command-sent for EVERY real send regardless
    // of source (typed, aliased, or programmatic) — this is what lets a
    // plugin-initiated `score` still get captured. Redundant with onAlias
    // for a real typed command (both fire) — harmless, arming is idempotent.
    onEnable(api: PluginRuntimeApi) {
      const offCommandSent = api.onEvent('shatteredarchive:command-sent', (payload) => {
        const text = String((payload as any)?.text ?? '')
          .trim()
          .toLowerCase();
        if (text === 'sc' || text === 'score') armScore();
      });

      return () => {
        offCommandSent();
        disarmScore();
      };
    },

    // game:tick/game:character-login/shatteredarchive:raw-data stay on THIS
    // top-level onEvent, not moved into the onEnable above, because game:tick
    // is ALSO in ROUTED_WINDOW_EVENTS (routed-gmcp-events.ts): a plugin that
    // defines onEvent gets the host's generic per-event wiring for it
    // automatically (pluginHost.ts's enable() loops ROUTED_WINDOW_EVENTS
    // after onEnable runs) — an onEnable-registered api.onEvent('game:tick',
    // ...) would use the SAME dedup key (pluginId+eventName) and get
    // silently overwritten by that generic wiring, never firing. Caught live
    // (not in a unit test, which mocks api.onEvent and can't see the
    // collision) via a Playwright check against the real dev server before
    // this ever shipped. onAlias is a separate, unrelated hook
    // (pluginHost.tryExecuteAlias, not routed through api.onEvent at all),
    // and the onEnable above registers shatteredarchive:command-sent — NOT
    // in ROUTED_WINDOW_EVENTS — so both coexist here with no such collision.
    onEvent(api: PluginRuntimeApi, evt: PluginEvent): void {
      if (evt.name === 'game:tick') {
        const time = (evt.payload as { time?: string } | undefined)?.time;
        if (!time) return;

        const period = timeStringToPeriod(time);
        if (period) setWorldTimeSnapshot({ period });
        return;
      }

      // game:character-login is ALSO in ROUTED_WINDOW_EVENTS (fired off GMCP
      // login_data by userScriptRuntime.ts), so this plugin gets it for free
      // via the same generic wiring noted above — used here to rearm the
      // score-sheet scan below for the newly-logged-in character.
      if (evt.name === 'game:character-login') {
        const snapshot = peekIdentitySnapshot();
        if (snapshot?.raceName || snapshot?.className) {
          setIdentitySnapshot({ raceName: undefined, className: undefined });
        }
        return;
      }

      if (evt.name === 'shatteredarchive:raw-data') {
        // Never scan ambient text — only the reply to a `sc`/`score` the
        // player just sent, satisfied or expired same as worth's fetch.
        if (!scoreArmed) return;

        const payload = evt.payload as { rawText?: string; text?: string } | undefined;
        const rawText = String(payload?.rawText ?? payload?.text ?? '');
        if (!rawText) return;

        const plain = scoreSheetGate(rawText);
        if (plain === null) return;

        // Satisfied: got a score-sheet chunk while armed. One shot — don't
        // keep scanning subsequent chunks in this window.
        disarmScore();

        // Rearms race/class itself when the reply's OWN name disagrees with
        // what's cached — covers a missed/absent game:character-login (see
        // the function comment). Must run BEFORE the capture-once check
        // below so a just-cleared raceName/className is seen as "not yet
        // captured" in the SAME pass, not next time.
        scanForScoreSheetName(plain);

        // Capture once: once both fields are known, skip the identity scan on
        // every subsequent `score` display until game:character-login (or the
        // name-mismatch rearm above) clears raceName/className. XP is NOT
        // capture-once (see scanForScoreSheetExp) — it runs every time regardless.
        const snapshot = peekIdentitySnapshot();
        if (!(snapshot?.raceName && snapshot?.className)) {
          scanForScoreSheetIdentity(plain);
        }
        scanForScoreSheetExp(plain);
      }
    },
  };
}
