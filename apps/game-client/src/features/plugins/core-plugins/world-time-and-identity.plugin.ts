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

function setIdentitySnapshot(patch: Partial<IdentitySnapshot>): void {
  const w = window as any;
  const cur = getIdentitySnapshot();
  const next: IdentitySnapshot = { ...cur, ...patch, updatedAt: Date.now() };
  w.__SA_IDENTITY__ = next;
  DispatchEvent('shatteredarchive:identity-updated', next);
}

// Matches the `score`/`sc` command's two-column layout, e.g.:
//   LEVEL: 42          Race : Topaz dragon      Played: 3887 hours
//   YEARS: 211         Class: Dragon            Log In: Tue Sep 15 ...
const SCORE_RACE_LINE_RE = /^LEVEL\s*:\s*\d+\s+Race\s*:\s*(.+?)\s{2,}Played/i;
const SCORE_CLASS_LINE_RE = /^YEARS\s*:\s*\d+\s+Class\s*:\s*(.+?)\s{2,}Log In/i;

// Fast gate mirroring probe-opponent-condition.ts's OPPONENT_GATES: a plain
// substring check on the RAW chunk, before any ANSI-stripping, splitting, or
// regex runs. Most incoming text contains none of these words.
const SCORE_GATE_KEYWORDS = ['Race', 'Class', 'LEVEL'];

function scanForScoreSheetIdentity(rawText: string): void {
  let gated = false;
  for (let i = 0; i < SCORE_GATE_KEYWORDS.length; i++) {
    if (rawText.indexOf(SCORE_GATE_KEYWORDS[i]) !== -1) {
      gated = true;
      break;
    }
  }
  if (!gated) return;

  const plain = stripAnsi(rawText);
  for (const rawLine of plain.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const raceMatch = line.match(SCORE_RACE_LINE_RE);
    if (raceMatch) {
      setIdentitySnapshot({ raceName: raceMatch[1].trim() });
      continue;
    }

    const classMatch = line.match(SCORE_CLASS_LINE_RE);
    if (classMatch) {
      setIdentitySnapshot({ className: classMatch[1].trim() });
    }
  }
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
  return {
    manifest: {
      id: 'world-time-and-identity',
      name: 'World Time & Identity',
      version: '0.1.0',
      description:
        'Derives a Dawn/Day/Dusk/Night period from the game tick clock, and reads race/class off the score sheet — powers the compact HUD\'s time-of-day icon and character glyph. Off by default for everyone else; the Slate & Amber theme turns it on automatically.',
    },

    // A single onEvent, not onEnable + onEvent: game:tick is ALSO in
    // ROUTED_WINDOW_EVENTS (routed-gmcp-events.ts), so a plugin that defines
    // onEvent gets the host's generic per-event wiring for it automatically
    // (pluginHost.ts's enable() loops ROUTED_WINDOW_EVENTS after onEnable
    // runs) — an onEnable-registered api.onEvent('game:tick', ...) would use
    // the SAME dedup key (pluginId+eventName) and get silently overwritten
    // by that generic wiring, never firing. Caught live (not in a unit test,
    // which mocks api.onEvent and can't see the collision) via a Playwright
    // check against the real dev server before this ever shipped.
    onEvent(api: PluginRuntimeApi, evt: PluginEvent): void {
      if (evt.name === 'game:tick') {
        const time = (evt.payload as { time?: string } | undefined)?.time;
        if (!time) return;

        const period = timeStringToPeriod(time);
        if (period) setWorldTimeSnapshot({ period });
        return;
      }

      if (evt.name === 'shatteredarchive:raw-data') {
        const payload = evt.payload as { rawText?: string; text?: string } | undefined;
        const rawText = String(payload?.rawText ?? payload?.text ?? '');
        if (!rawText) return;

        scanForScoreSheetIdentity(rawText);
      }
    },
  };
}
