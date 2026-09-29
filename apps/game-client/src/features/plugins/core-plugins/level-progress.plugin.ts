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
 * It is constant for a character UNTIL a reclass or retrain changes it — DSL
 * has both (unlike vanilla ROM, which has neither): reclass keeps half your
 * played hours, retrain is free and can be done live at a trainer with no
 * relogin required. Confirmed with real numbers, not just mechanic existence
 * — GameLog-DSL_2023-05-0{1,2,8}, an example character: level 1 Warrior (XP 3600,
 * tnl 3600) and level 45→46 Warrior (XP 163330→167444, tnl 2270→1756) both
 * give exp_per_level = 3600; a reclass to level 25 Ranger the same week gives
 * exp_per_level = 1,000,000 — a 278x swing from the SAME character, one
 * class-only change. No source access to DSL's own exp formula, so this
 * plugin can only react to evidence, never derive the new constant without
 * asking `worth` again. So a learned value is trusted until one of two things
 * contradicts it:
 *
 *   - At login, the freshly reported level is BELOW the level we last
 *     confirmed at (a retrain rewound levels), or the character's known class
 *     (from the score-sheet identity scan, world-time-and-identity.plugin.ts
 *     — GMCP has no class field) no longer matches what we confirmed with (a
 *     reclass). Class isn't known synchronously at login (that scan rearms on
 *     login and only refills on the next `score`/`sc`), so this half of the
 *     check runs whenever a fresh class arrives, not just at login.
 *   - Mid-session, a char_data tnl arrives LARGER than the confirmed
 *     exp-per-level — impossible if the stored value were still correct, so
 *     this is what actually catches a live retrain (no relogin to hook).
 *
 * Either one drops the stored value and hands back exactly one fresh
 * auto-fetch attempt — the same per-session budget used for "never learned
 * yet", not a separate counter, so a run of bad luck can't spam `worth`.
 *
 * `worth` isn't the only source: world-time-and-identity.plugin.ts's
 * score-sheet scan ALSO reads level/XP/XP-To-Level (same command, same
 * moment, same computeExpPerLevel formula) and announces them on
 * shatteredarchive:score-sheet-exp every time the player runs `score`/`sc` on
 * their own — free, no `worth` needed. That confirmation always wins over
 * whatever was stored (it's a full re-derivation, not a staleness guess) and
 * cancels a now-redundant in-flight auto-fetch.
 *
 * Deliberately NOT an always-on matcher for `worth`, though: no text listener
 * exists until a fetch is in flight. The `worth` reply is only looked for
 * between sending the command and getting it (or a short timeout), then the
 * raw-data subscription is disposed. Outside that window the plugin only
 * handles small structured events (login, char_data, identity updates,
 * score-sheet exp, connection close) — numeric/string compares, no regexes.
 *
 * The result is announced on `shatteredarchive:exp-per-level`; the HUD store
 * uses it as the exact span and falls back to its high-water estimate when
 * this plugin is off, has not learned the value yet, or just distrusted it.
 */

const STORAGE_KEY = 'shatteredarchive:exp-per-level:v2';
const FETCH_TIMEOUT_MS = 20_000;

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

/** What's cached per character: the confirmed span plus the level/class it was confirmed at. */
type StoredEntry = { expPerLevel: number; level: number; className: string | null };

function readStore(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readStored(name: string): StoredEntry | null {
  const store = readStore();
  if (!Object.prototype.hasOwnProperty.call(store, name)) return null;
  const v = store[name] as Partial<StoredEntry> | undefined;
  if (
    !v ||
    typeof v.expPerLevel !== 'number' ||
    !Number.isFinite(v.expPerLevel) ||
    v.expPerLevel <= 0 ||
    typeof v.level !== 'number' ||
    !Number.isFinite(v.level)
  ) {
    return null;
  }
  return {
    expPerLevel: v.expPerLevel,
    level: v.level,
    className: typeof v.className === 'string' ? v.className : null,
  };
}

function writeStored(name: string, entry: StoredEntry): void {
  try {
    const store = readStore();
    store[name] = entry;
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
        'Learns how much exp one level costs for your character (one `worth` command, saved per character) so the compact HUD EXP bar is exact from the first packet. Re-learns automatically after a retrain or reclass. Without it the bar falls back to an estimate. Two manual actions available if you need to reconcile who the client thinks you are: "Re-fetch now" (worth) and "Check score" (score — can re-establish name/level/class/race too).',
    },

    configSchema: {
      defaults: { autoFetch: true },
      fields: [
        {
          key: 'autoFetch',
          type: 'boolean',
          label: 'Fetch automatically',
          description:
            'When a character has no trusted saved value — including right after a retrain/reclass invalidates one — send `worth` once to (re)learn it. Turn off to fetch only with the button below.',
        },
      ],
      actions: [
        {
          key: 'refetch',
          label: 'Re-fetch now (worth)',
          description: 'Sends `worth` once and replaces the saved value — e.g. after a reclass.',
        },
        {
          key: 'check-score',
          label: 'Check score',
          description:
            'Sends `score` — with World Time & Identity also enabled, this can re-establish your name/level/class/race too, not just exp-per-level. Use this if the game ever failed to tell the client who you are.',
        },
      ],
    },

    onEnable(api: PluginRuntimeApi) {
      // Starts the store's own listeners too, so its level tracking is live
      // even when the compact row isn't mounted.
      const offStore = subscribeLevelProgress(() => {});

      let name: string | null = null;
      let stored: StoredEntry | null = null;
      let knownClassName: string | null = null;
      let autoAttempted = false; // one shot; handed back by distrust() below

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

      /** Drops the stored value, hands back one fresh auto-fetch attempt, and takes it. */
      const distrust = (reason: string) => {
        if (stored === null || name === null) return;
        stored = null;
        autoAttempted = false;
        api.log(`Exp-per-level looks stale (${reason}) — re-learning it.`);
        announce(name, null);
        tryAutoFetch();
      };

      /** Compares the trusted value against what's known NOW; drops it if contradicted. */
      const checkStillTrusted = (currentLevel: number | null) => {
        if (stored === null || name === null) return;
        if (currentLevel !== null && currentLevel < stored.level) {
          distrust(`level ${currentLevel} is below the ${stored.level} it was learned at`);
          return;
        }
        if (knownClassName !== null && stored.className !== null && knownClassName !== stored.className) {
          distrust(`class is now ${knownClassName}, was ${stored.className}`);
        }
      };

      const setCharacter = (next: string | null, loginLevel: number | null) => {
        if (next === name) return;
        name = next;
        stored = next ? readStored(next) : null;
        if (next && stored !== null) {
          checkStillTrusted(loginLevel);
          if (stored !== null) announce(next, stored.expPerLevel);
        }
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

        if (value === null || level === null || forName === null || forName !== name) {
          api.log(
            `Unexpected worth values (exp ${expTotal}, to level ${tnl}, level ${level}) — keeping the estimated bar.`,
          );
          return;
        }

        const entry: StoredEntry = { expPerLevel: value, level, className: knownClassName };
        writeStored(forName, entry);
        stored = entry;
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

      // Pick up a character that logged in (and was already identified)
      // before this plugin was enabled.
      try {
        const identitySnap = (window as any).__SA_IDENTITY__;
        if (typeof identitySnap?.className === 'string') knownClassName = identitySnap.className;

        const loginSnap = (window as any).__SA_EVENT_SNAPSHOTS__?.['game:character-login'];
        if (typeof loginSnap?.name === 'string') {
          const lvl =
            typeof loginSnap?.level === 'number' && Number.isFinite(loginSnap.level) ? loginSnap.level : null;
          setCharacter(loginSnap.name, lvl);
        }
      } catch {
        // ignore
      }

      const offLogin = api.onEvent('game:character-login', (payload) => {
        const next = (payload as any)?.name;
        const lvl = (payload as any)?.level;
        const parsedNext = typeof next === 'string' ? next : null;
        // A real login (not the enable-time catch-up above): the new
        // character's class is unknown until the score-sheet scan reports
        // one, whatever the previous character's class happened to be.
        if (parsedNext !== name) knownClassName = null;
        setCharacter(parsedNext, typeof lvl === 'number' && Number.isFinite(lvl) ? lvl : null);
      });

      // The score-sheet identity scan (world-time-and-identity.plugin.ts) is
      // this character's only source of class — no GMCP equivalent exists.
      // It rearms on every login and only refills on the next `score`/`sc`,
      // so this fires independently of (and normally after) login.
      const offIdentity = api.onEvent('shatteredarchive:identity-updated', (payload) => {
        const cn = (payload as any)?.className;
        if (typeof cn !== 'string') return;
        knownClassName = cn;
        checkStillTrusted(getLevelProgress().level);
      });

      // A free, self-contained confirmation every time the player runs
      // `score`/`sc` on their own — world-time-and-identity.plugin.ts reads
      // level/XP/XP-To-Level off the SAME command, so there's no cross-source
      // staleness the way there is between GMCP's tnl and a separately-tracked
      // level. Treated exactly like a resolved `worth` fetch: it replaces
      // whatever was stored (even a value that still looked trustworthy) and
      // cancels a now-redundant in-flight auto-fetch.
      const offScoreExp = api.onEvent('shatteredarchive:score-sheet-exp', (payload) => {
        const p = payload as { characterName?: unknown; level?: unknown; xp?: unknown; xpToLevel?: unknown };
        if (typeof p.characterName !== 'string') return;

        if (name === null) {
          // Self-heal: game:character-login was missed for this character
          // (confirmed live 2026-09-26 — a mid-session character switch
          // while GMCP happened to be disabled; re-enabling GMCP afterward
          // does not retroactively resend login_data) — a single sc/score
          // is enough to fully establish identity on its own, not just
          // refresh an already-known one. No need to read/trust any old
          // cached value here; it's overwritten below from this same
          // complete reading regardless.
          name = p.characterName;
        } else if (p.characterName !== name) {
          return; // a different character's reading — not for us
        }
        const forName = name;

        if (typeof p.level !== 'number' || typeof p.xp !== 'number' || typeof p.xpToLevel !== 'number') return;

        const value = computeExpPerLevel(p.level, p.xp, p.xpToLevel);
        if (value === null) {
          api.log(`Unexpected score values (xp ${p.xp}, to level ${p.xpToLevel}, level ${p.level}) — ignoring.`);
          return;
        }

        if (armed) disarm(); // the score reply already answered what worth was waiting for
        autoAttempted = true;

        const entry: StoredEntry = { expPerLevel: value, level: p.level, className: knownClassName };
        writeStored(forName, entry);
        stored = entry;
        announce(forName, value);
      });

      const offCharData = api.onEvent('game:char-data', (payload) => {
        const tnl = (payload as any)?.tnl;
        if (typeof tnl !== 'number' || !Number.isFinite(tnl) || name === null) return;

        if (stored === null) {
          tryAutoFetch();
        } else if (tnl > stored.expPerLevel) {
          // Impossible if `stored` were still right: a level can't cost more
          // exp than the value we confirmed it at. A live retrain (no
          // relogin needed in DSL) is the expected cause.
          distrust(`char_data tnl ${tnl} exceeds the confirmed ${stored.expPerLevel}`);
        }
      });

      const offClose = api.onEvent('game:remote-server:close', () => {
        disarm();
        autoAttempted = false;
        name = null;
        stored = null;
        knownClassName = null;
      });

      // Deliberately NOT gated on canFetch(): the user may be pressing this
      // specifically to try to reconcile who they are (e.g. after the exact
      // self-heal scenario checkStillTrusted/offScoreExp above exist for —
      // login_data missed entirely). Blocking the button with "log in
      // first" is unhelpful right when they're trying to fix that. If
      // identity genuinely isn't known, the reply still can't be attributed
      // to anyone (worth's own text carries no name or level) and finish()
      // reports that plainly once the reply arrives, rather than refusing
      // to even try up front. "Check score" below is the button that can
      // actually resolve an unknown identity on its own.
      api.registerAction('refetch', () => {
        if (armed) {
          api.log('Already waiting for a "worth" reply.');
          return;
        }
        startFetch();
      });

      // `score`'s own reply carries name/level/class/race/XP all at once —
      // unlike `worth`, this alone can fully resolve an unknown identity
      // (e.g. game:character-login was missed). Requires the World Time &
      // Identity plugin also enabled to actually capture the reply; sent
      // either way since this plugin has no way to check that.
      api.registerAction('check-score', () => {
        api.sendCommand('score');
      });

      return () => {
        disarm();
        offLogin();
        offIdentity();
        offScoreExp();
        offCharData();
        offClose();
        offStore();
        // Back to the estimated bar.
        if (name !== null) announce(name, null);
      };
    },
  };
}
