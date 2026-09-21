// apps\game-client\src\features\plugins\core-plugins\level-progress.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { DispatchEvent } from '../../event-emitter/event-dispatcher';
import { stripAnsi } from '../../autoleveling/autoleveling-text';
import { MAX_LEVEL, getLevelProgress, subscribeLevelProgress } from '../../charData/levelProgressStore';

/**
 * Level Progress — learns how much exp ONE level costs for the connected
 * character, so the compact HUD's EXP gauge is exact instead of estimated.
 *
 * GMCP gives us the level and `tnl` (exp remaining) but not the exp span of a
 * level. The `worth` command prints `Exp Total` and `Exp to Level`, and the
 * server computes tnl = (level + 1) * exp_per_level - exp, so
 *
 *     exp_per_level = (exp total + exp to level) / (level + 1)
 *
 * It is constant for a character, so it is fetched ONCE, saved per character
 * name, and never asked for again.
 *
 * Deliberately NOT an always-on matcher: no text listener exists until a fetch
 * is in flight. The `worth` reply is only looked for between sending the
 * command and getting it (or a short timeout), then the raw-data subscription
 * is disposed. Outside that window the plugin only handles small structured
 * events (login, char_data, connection close) — numeric compares, no regexes.
 *
 * The result is announced on `shatteredarchive:exp-per-level`; the HUD store
 * uses it as the exact span and falls back to its high-water estimate when
 * this plugin is off or has not learned the value yet.
 */

const STORAGE_KEY = 'shatteredarchive:exp-per-level:v1';
const FETCH_TIMEOUT_MS = 10_000;

// Line-anchored so chat that merely quotes "Exp Total : 5" can't match.
// Only ever executed while a fetch is in flight (see parseWorth's callers).
const EXP_TOTAL_RE = /^\s*Exp Total\s*:\s*([\d,]+)/im;
const EXP_TO_LEVEL_RE = /^\s*Exp to Level\s*:\s*([\d,]+)/im;

const toInt = (digits: string): number => Number(digits.replace(/,/g, ''));

export function parseWorth(text: string): { expTotal?: number; tnl?: number } {
  const out: { expTotal?: number; tnl?: number } = {};
  const total = EXP_TOTAL_RE.exec(text);
  if (total) out.expTotal = toInt(total[1]);
  const tnl = EXP_TO_LEVEL_RE.exec(text);
  if (tnl) out.tnl = toInt(tnl[1]);
  return out;
}

/** Exp cost of one level, or null when the numbers don't fit the model. */
export function computeExpPerLevel(level: number, expTotal: number, tnl: number): number | null {
  if (!Number.isInteger(level) || level < 1) return null;
  if (!Number.isInteger(expTotal) || expTotal < 0) return null;
  if (!Number.isInteger(tnl) || tnl < 1) return null;

  const sum = expTotal + tnl;
  const divisor = level + 1;
  if (sum % divisor !== 0) return null; // the linear model doesn't hold here — don't guess

  return sum / divisor;
}

function readStore(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readStored(name: string): number | null {
  const store = readStore();
  if (!Object.prototype.hasOwnProperty.call(store, name)) return null;
  const v = store[name];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function writeStored(name: string, value: number): void {
  try {
    const store = readStore();
    store[name] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore (private mode / quota)
  }
}

const announce = (name: string, expPerLevel: number | null) =>
  DispatchEvent('shatteredarchive:exp-per-level', { name, expPerLevel });

export function createLevelProgressPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'level-progress',
      name: 'Level Progress',
      version: '0.1.0',
      description:
        'Learns how much exp one level costs for your character (one `worth` command, once, saved per character) so the compact HUD EXP bar is exact from the first packet. Without it the bar falls back to an estimate.',
    },

    configSchema: {
      defaults: { autoFetch: true },
      fields: [
        {
          key: 'autoFetch',
          type: 'boolean',
          label: 'Fetch automatically (once per session)',
          description:
            'When a character has no saved value, send `worth` once after login to learn it. Never repeats for a character that already has one. Turn off to fetch only with the button below.',
        },
      ],
      actions: [
        {
          key: 'refetch',
          label: 'Re-fetch now (worth)',
          description: 'Sends `worth` once and replaces the saved value — e.g. after a reclass.',
        },
      ],
    },

    onEnable(api: PluginRuntimeApi) {
      // Starts the store's own listeners too, so its level tracking is live
      // even when the compact row isn't mounted.
      const offStore = subscribeLevelProgress(() => {});

      let name: string | null = null;
      let stored: number | null = null;
      let autoAttempted = false; // once per session, shared by "no value yet" and "looks stale"

      let armed = false;
      let fetchName: string | null = null;
      let partial: { expTotal?: number; tnl?: number } = {};
      let timerId: ReturnType<typeof setTimeout> | null = null;
      let offRaw: (() => void) | null = null;

      const disarm = () => {
        armed = false;
        partial = {};
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        if (offRaw) {
          offRaw();
          offRaw = null;
        }
      };

      const setCharacter = (next: string | null) => {
        if (next === name) return;
        name = next;
        stored = next ? readStored(next) : null;
        if (next && stored !== null) announce(next, stored);
      };

      const finish = () => {
        const { expTotal, tnl } = partial;
        const forName = fetchName;
        const level = getLevelProgress().level;
        disarm();

        const value =
          expTotal !== undefined && tnl !== undefined && level !== null
            ? computeExpPerLevel(level, expTotal, tnl)
            : null;

        if (value === null || forName === null || forName !== name) {
          api.log(
            `Unexpected worth values (exp ${expTotal}, to level ${tnl}, level ${level}) — keeping the estimated bar.`,
          );
          return;
        }

        writeStored(forName, value);
        stored = value;
        announce(forName, value);
      };

      const onRaw = (payload: unknown) => {
        const rawText = String((payload as any)?.rawText ?? (payload as any)?.text ?? '');
        if (!rawText) return;

        partial = { ...partial, ...parseWorth(stripAnsi(rawText)) };
        if (partial.expTotal !== undefined && partial.tnl !== undefined) finish();
      };

      /** Sends `worth` and listens for its reply — only until it arrives or times out. */
      const startFetch = () => {
        armed = true;
        fetchName = name;
        partial = {};

        offRaw = api.onEvent('shatteredarchive:raw-data', onRaw);
        timerId = setTimeout(() => {
          disarm();
          api.log('No reply to "worth" — keeping the estimated bar for now.');
        }, FETCH_TIMEOUT_MS);

        api.sendCommand('worth');
      };

      const canFetch = (): boolean => {
        if (name === null) return false;
        const level = getLevelProgress().level;
        return level !== null && level < MAX_LEVEL;
      };

      const tryAutoFetch = () => {
        if (api.getConfig().autoFetch === false) return;
        if (autoAttempted || armed || !canFetch()) return;
        autoAttempted = true;
        startFetch();
      };

      // Pick up a character that logged in before this plugin was enabled.
      try {
        const snap = (window as any).__SA_EVENT_SNAPSHOTS__?.['game:character-login'];
        if (typeof snap?.name === 'string') setCharacter(snap.name);
      } catch {
        // ignore
      }

      const offLogin = api.onEvent('game:character-login', (payload) => {
        const next = (payload as any)?.name;
        setCharacter(typeof next === 'string' ? next : null);
      });

      const offCharData = api.onEvent('game:char-data', (payload) => {
        const tnl = (payload as any)?.tnl;
        if (typeof tnl !== 'number' || !Number.isFinite(tnl) || name === null) return;

        if (stored === null) {
          tryAutoFetch();
        } else if (tnl > stored) {
          // Impossible if `stored` were right: a level can't be more than one span away.
          tryAutoFetch();
        }
      });

      const offClose = api.onEvent('game:remote-server:close', () => {
        disarm();
        autoAttempted = false;
        name = null;
        stored = null;
      });

      api.registerAction('refetch', () => {
        if (armed) {
          api.log('Already waiting for a "worth" reply.');
          return;
        }
        if (!canFetch()) {
          api.log('Log in with a character below the max level first, then try again.');
          return;
        }
        startFetch();
      });

      return () => {
        disarm();
        offLogin();
        offCharData();
        offClose();
        offStore();
        // Back to the estimated bar.
        if (name !== null) announce(name, null);
      };
    },
  };
}
