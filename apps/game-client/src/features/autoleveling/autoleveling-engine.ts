// apps/game-client/src/features/autoleveling/autoleveling-engine.ts

/**
 * AutoLevelingEngine (runtime)
 * ----------------------------
 * Intent:
 * - Drive an automated "round" loop using a semicolon-separated trainingPath (config.init.trainingPath).
 * - Gate movement using movement-succeeded/movement-failed events so automation doesn't outrun the client.
 * - Detect encounters from terminal text (lookName match) and inject an engagement+fight sequence.
 * - Own engagement:
 *   - initiationCommand template + keyword attempts until GMCP says fighting=true
 *   - If terminal says "They aren't here", try next keyword immediately.
 * - Provide wait primitives for scripted actions:
 *   - wait_ms, wait_text, wait_regex, wait_fighting
 *
 * Step order (as implemented):
 *  Round:
 *   A) start.pre -> start.exec -> start.post   (every round; if_affect_missing / send_every_ticks gate the buffs)
 *   B) For each trainingPath segment (config.init.trainingPath split by ';', blanks dropped):
 *       1) if the segment is a movement: move.pre
 *       2) send segment (shatteredarchive:send-command — the shared movementTracker enqueues
 *          it and dispatches movement-attempt itself off the resulting command-sent signal)
 *       3) if movement: waitForMovement(...) via the tracker's own movement-succeeded/-failed
 *          (a {room,sector,exits} diff, not just any game:room-data arrival); else: delay lookSettleMs
 *       4) if movement: move.post
 *       5) flushInjected()  (injected encounter: engage -> fight.pre/exec/post -> recheckBuffs -> postFight -> identify re-scan)
 *       6) if movement: delay moveSettleMs
 *   C) reset.endRound
 *   D) if loopRounds=false: stop. else: reset.wait actions if any, else delay roundLoopTimeMs; then next round
 *
 * Runtime buff behaviour (config.criticalBuffs + tnl tracking):
 *   - game:tick increments a counter that send_every_ticks paces against; tick buffs fire OUT OF COMBAT only
 *   - affect-gated (if_affect_missing) + tick buffs are re-checked at the top of each round AND after every fight
 *     ends (recheckBuffs); "every round" buffs (bare send) fire only at the top of the round
 *   - char_data.tnl drops feed a rolling kill-XP estimate; the mob's alignment is read live from the
 *     (Golden Aura)/(Red Aura) prefix on its room line (scanMobAlignment), normalized by the alignment modifier
 *   - each XP gain writes a bright [auto-level] terminal line: xp gained + ~kills-to-level from that estimate
 *   - a criticalBuff affect dropping mid-fight fires its inCombatCmd (item action); the recast is left to recheckBuffs
 *   - a holdNearLevel buff is not re-cast while tnl <= the kill-XP estimate
 *
 * Encounter injection (async between any two actions/segments):
 * - on terminal-data: if lookName matches and not locked => inject __engage_target at front of queue, lock encounters
 * - flushInjected:
 *    - engageTarget() attempts keywords
 *    - if engaged, run fight triplet, then ensure fighting ends, then unlock encounters
 *    - if engage fails, unlock and continue
 */

import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import type {
  AutoLevelAction,
  AutoLevelAlignment,
  AutoLevelConfig,
  AutoLevelCriticalBuff,
  AutoLevelOnceKey,
  AutoLevelRestDuringRoundRule,
  AutoLevelRunState,
  AutoLevelTarget,
  AutoLevelVitalsGate,
  AutoLevelXpProgress,
} from './autoleveling-types';
import { alignmentXpModifier } from './autoleveling-alignment';
import { DAMAGE_LINE_PATTERN } from '../plugins/core-plugins/combat-compression.plugin';
import { classifyMovement, MOVE_DIRS } from '../movement/classifyMovement';
import { movementTracker, type RoomSnapshot } from '../movement/movementTracker';

type EngineDeps = {
  getConfig: () => AutoLevelConfig;
  setRunState: (s: AutoLevelRunState) => void;
  setXpProgress?: (p: AutoLevelXpProgress) => void;
  /**
   * A fight-command re-fired within the same round (queue buildup, see
   * commandsWithQueueBuildup) — cmd is the raw command string, cooldownSec the bumped
   * value to persist. Also applied live for the rest of this run (see
   * learnedCooldownSec) — the hook wires this to autoleveling-user-data's per-ability
   * learned-cooldown store so it survives into future runs too.
   */
  onAbilityCooldownLearned?: (cmd: string, cooldownSec: number) => void;
  /**
   * Looks up a previously-learned cooldown for `cmd` (or null if none), used to seed
   * learnedCooldownSec at start() so a command that queued last session doesn't have to
   * re-discover the same lag from scratch — the real in-game lag doesn't change run to run.
   */
  getLearnedCooldown?: (cmd: string) => Promise<number | null>;
  /**
   * Routes `cmd` through the same alias/script "command processor" a manually-typed terminal
   * line goes through (RuntimeSingleton.Runtime.executeAlias), instead of a raw literal send —
   * used ONLY for rest.startOfRound/endOfRound (see REST_STEP_LABELS), so a user's own rest
   * alias/macro ("command stacking") actually expands rather than being sent to the MUD
   * verbatim. Absent = falls back to the same raw send every other action kind uses.
   */
  sendThroughCommandProcessor?: (cmd: string) => void;
};

type MovementResult =
  | { result: 'succeeded'; cmd: string; room?: RoomSnapshot }
  | { result: 'failed'; cmd: string; reasonLine?: string }
  | { result: 'timeout'; cmd: string; reasonLine: string };

type InjectedEngineAction =
  | AutoLevelAction
  | {
      kind: '__engage_target';
      target: AutoLevelTarget;
    }
  | {
      kind: '__dry_run_notify';
      target: AutoLevelTarget;
      /** The command that would have been sent in auto_level mode. */
      wouldSend: string;
    };

const ANSI_CSI_RE = /\u001b\[[0-9;]*m/g;

/* ----------------------------- debug helpers ------------------------------ */

const ENG_LOG_PREFIX = '[autoleveling][engine]';

function isAutoLevelingDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__AUTOLEVELING_DEBUG__ === true) return true;

    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('autoleveling.debug') : null;
    if (v === '1' || v === 'true') return true;

    return false;
  } catch {
    return false;
  }
}

function dbg(...args: any[]) {
  if (!isAutoLevelingDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug(ENG_LOG_PREFIX, ...args);
}

function warn(...args: any[]) {
  if (!isAutoLevelingDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn(ENG_LOG_PREFIX, ...args);
}

function normMatch(input: string): string {
  return (
    stripAnsi(String(input ?? ''))
      .replace(/\r/g, '')
      .toLowerCase()
      // remove punctuation/symbols (keep letters/numbers/spaces)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/* ------------------------------------------------------------------------- */

function stripAnsi(input: string): string {
  return String(input ?? '').replace(ANSI_CSI_RE, '');
}

function normLine(input: string): string {
  return stripAnsi(input).replace(/\r/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function now() {
  return Date.now();
}

/** Backstop for "waiting for a fight to end with no fight.exec configured" — see call site. */
const FIGHT_END_BACKSTOP_MS = 10 * 60_000;

/**
 * `runActions` stepLabels whose `send` actions route through the command processor
 * (RuntimeSingleton.Runtime.executeAlias, via deps.sendThroughCommandProcessor) instead of a
 * raw literal send — see sendViaCommandProcessor. Both the natural per-round hooks AND the
 * during-round low-vitals trigger share these two labels (checkDuringRoundRest calls the exact
 * same runActions(cfg.rest.endOfRound/startOfRound, ...) the round loop does), so fixing it
 * here covers both without a separate during-round-only field.
 */
const REST_STEP_LABELS = new Set(['rest.startOfRound', 'rest.endOfRound']);

// Verified damage-line matcher shared with combat-compression.plugin.ts's squelch rules —
// reused here as the round-boundary signal (see AutoLevelingEngine.trackRoundBoundary).
const DAMAGE_LINE_RE = new RegExp(DAMAGE_LINE_PATTERN, 'm');

/** A "round" ends this long after the last observed damage line with no new one — mirrors
 *  DslLogViewer's proven ROUND_GAP_MS gap-since-last-damage heuristic. */
const ROUND_GAP_MS = 1000;

/** Cooldown bump applied each time a fight-command re-fires within the same round. */
const COOLDOWN_LEARN_BUMP_SEC = 0.5;

const REVERSE_DIR: Record<string, string> = {
  n: 's',
  s: 'n',
  e: 'w',
  w: 'e',
  ne: 'sw',
  sw: 'ne',
  nw: 'se',
  se: 'nw',
  u: 'd',
  d: 'u',
  up: 'down',
  down: 'up',
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

function reverseMovementCommand(cmd: string): string | null {
  const c = String(cmd ?? '')
    .trim()
    .toLowerCase();
  return REVERSE_DIR[c] ?? null;
}

function applyInitiationTemplate(template: string, keyword: string): string {
  const k = String(keyword ?? '');
  const t = String(template ?? '');
  // Support {name} (preferred), plus some back-compat placeholders.
  return t
    .replace(/\{name\}/g, k)
    .replace(/\{target\}/g, k)
    .replace(/\{keyword\}/g, k);
}

function normCmd(cmd: string): string {
  return String(cmd ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeDirToken(v: unknown): string | null {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();

  if (!s) return null;

  // already canonical
  if (MOVE_DIRS.has(s)) return s;

  // common long forms
  if (s === 'north') return 'n';
  if (s === 'south') return 's';
  if (s === 'east') return 'e';
  if (s === 'west') return 'w';
  if (s === 'northeast') return 'ne';
  if (s === 'northwest') return 'nw';
  if (s === 'southeast') return 'se';
  if (s === 'southwest') return 'sw';
  if (s === 'up') return 'up';
  if (s === 'down') return 'down';

  // compass-style (sometimes already handled, but keep explicit)
  if (s === 'u') return 'u';
  if (s === 'd') return 'd';

  return null;
}

function extractEventMoveKey(detail: any): { cmd?: string; dir?: string; ts?: number; room?: any; reasonLine?: any } {
  const cmd = detail?.cmd != null ? normCmd(detail.cmd) : undefined;

  const dir = normalizeDirToken(detail?.dir) ?? normalizeDirToken(detail?.direction) ?? undefined;

  const ts = typeof detail?.ts === 'number' ? detail.ts : undefined;

  return {
    cmd,
    dir,
    ts,
    room: detail?.room,
    reasonLine: detail?.reasonLine,
  };
}

export class AutoLevelingEngine {
  private deps: EngineDeps;

  private isBound = false;
  private offListeners: Array<() => void> = [];

  private trainingPathSteps: string[] = [];

  private stopping = false;
  private paused = false;
  /** True between start() entering its loop and the loop exiting. Gates the XP-progress terminal line. */
  private running = false;

  private injectedQueue: InjectedEngineAction[] = [];

  private isFighting = false;

  // encounter gating
  private encounterLocked = false;
  private lastEncounterMatch: { targetCleanName: string; lookName: string; at: number } | null = null;
  // dry_run: track mobs already announced this room so we only fire once per mob per room
  private dryRunAnnouncedThisRoom = new Set<string>();

  // sightsee mode — per-step gate
  private sightseeWait: null | {
    promise: Promise<'next' | 'prev'>;
    resolve: (d: 'next' | 'prev') => void;
    reject: (e: any) => void;
  } = null;
  private lastMovementCmd: string | null = null;

  // movement gating
  private moveWait: null | {
    promise: Promise<MovementResult>;
    resolve: (r: MovementResult) => void;
    reject: (e: any) => void;
    timeoutId: ReturnType<typeof setTimeout> | null;
    startedAt: number;
    cmd: string; // normalized
    dir?: string; // normalized direction token (n/ne/up/etc)
  } = null;

  // generic waits used by action scripts (advanced)
  private waitText: null | {
    kind: 'text';
    text: string;
    caseInsensitive: boolean;
    resolve: () => void;
    reject: (e: any) => void;
    timeoutId: ReturnType<typeof setTimeout> | null;
  } = null;

  private waitRegex: null | {
    kind: 'regex';
    re: RegExp;
    resolve: () => void;
    reject: (e: any) => void;
    timeoutId: ReturnType<typeof setTimeout> | null;
  } = null;

  private waitFighting: null | {
    value: boolean;
    resolve: () => void;
    reject: (e: any) => void;
    timeoutId: ReturnType<typeof setTimeout> | null;
  } = null;

  // engagement wait (keyword attempts)
  private engageWait: null | {
    startedAt: number;
    minDelayMs: number;
    resolve: (r: { ok: boolean; reason?: string }) => void;
    reject: (e: any) => void;
    timeoutId: ReturnType<typeof setTimeout> | null;
    sawNotHere: boolean;
  } = null;

  // cached targets for detection
  private targets: Array<{
    target: AutoLevelTarget;
    lookNameNorm: string; // normalized with normMatch(...)
  }> = [];

  // The run's config snapshot — deliberately captured ONCE per run (`start()`, "single
  // consistent cfg") rather than re-fetched every round, so most of the round loop reads a
  // stable value for the whole run. An instance field (not a local `const`) so it CAN be
  // refreshed from an explicit resync point (`refreshRunSnapshot`, called on pause->resume)
  // without threading a new parameter through every method that reads it.
  private cfg!: AutoLevelConfig;

  // GMCP vitals — updated by game:char-data events
  private charVitals = { hp: 0, hpMax: 0, mp: 0, mpMax: 0, mv: 0, mvMax: 0, carryWeight: 0, carryWeightMax: 0 };

  // Edge-triggered latch for the weight gate — fires once per threshold crossing, not on every
  // check while still overweight. Reset once weight% drops back below the threshold.
  private weightGateFired = false;

  // ── Round/fight tracking — once-per-round/once-per-fight gates + the shared
  // commands-sent-vs-rounds-observed queue-buildup signal (steps 4 and 5 both read it).
  // All reset together at the start of each NEW encounter (setIsFighting false->true).
  private lastDamageTs: number | null = null;
  private roundBoundaryTimer: ReturnType<typeof setTimeout> | null = null;
  private roundsObservedThisEncounter = 0;
  private commandsSentThisEncounter = 0;
  private onceFiredThisRound = new Set<string>();
  private onceFiredThisFight = new Set<string>();
  /** cmd key -> already sent since the last round boundary; cleared every round. */
  private perCommandSentSinceRound = new Set<string>();
  /** cmd keys that re-fired within the same round this encounter — step 5 reads this. */
  private commandsWithQueueBuildup = new Set<string>();

  /** last-sent timestamp (ms) per command, for `send_cooldown` actions. Cleared each run. */
  private cooldownLastSent = new Map<string, number>();

  /**
   * cmd key -> learned cooldown (seconds), live-applied on top of the configured
   * `cooldownSec` for `send_cooldown` gating. Seeded from the persisted per-ability store
   * at start() (see seedLearnedCooldowns) and bumped further, cumulatively, on every
   * additional queue-buildup detection this run — the real in-game lag is constant, so
   * each re-trigger climbs from the last-learned value, not the original config value.
   */
  private learnedCooldownSec = new Map<string, number>();

  /** GMCP tick counter — drives `send_every_ticks`. Reset each run. */
  private tickCount = 0;
  /** tickCount at last cast, per command, for `send_every_ticks`. Cleared each run. */
  private everyTicksLastCast = new Map<string, number>();

  /** Last observed `char_data.tnl` (XP to next level). */
  private lastTnl: number | null = null;
  /** Rolling per-kill XP samples, normalized to base XP (alignment modifier divided out). */
  private killXpSamples: number[] = [];
  /** Predicted raw XP of the next kill (rolling base average × current alignment modifier). */
  private estKillXp = 0;
  /** Kills observed this run (via tnl drops) — shown in the XP-progress line. Reset each run. */
  private sessionKills = 0;
  /** Last reaction time (ms) per critical-buff affect — anti-flap throttle. */
  private criticalBuffReactionAt = new Map<string, number>();
  /**
   * Alignment of the mob currently being engaged, read from the `(Golden Aura)` /
   * `(Red Aura)` prefix on its room/look line (needs `detect good` / `detect evil`
   * running). null = not detected → treated as neutral for the kill-XP estimate.
   */
  private currentTargetAlignment: AutoLevelAlignment | null = null;

  // GMCP affects — normalized lowercase names of currently-active affects
  private activeAffects = new Set<string>();

  private boundOnTerminalData = (ev: Event) => {
    if (this.stopping || this.paused) {
      return;
    }
    const ce = ev as CustomEvent<any>;
    const textRaw = ce?.detail?.text;
    if (textRaw === undefined || textRaw === null) return;
    const text = String(textRaw);

    dbg('terminal-data', { sample: stripAnsi(text).slice(0, 120) });

    // feed waits
    this.onTerminalLine(text);

    // engagement failure signal: "They aren't here"
    this.onTerminalEngageHeuristics(text);

    // mob alignment from the (Golden Aura) / (Red Aura) prefix
    this.scanMobAlignment(text);

    // round-boundary tracking (once-per-round gates + queue-buildup detection)
    this.trackRoundBoundary(text);

    // encounter detection
    if (!this.encounterLocked && !this.stopping) {
      this.tryDetectEncounter(text);
    }
  };

  /**
   * A mob's room / look line is prefixed with parenthesised flags; among them
   * `(Golden Aura)` marks a good-aligned mob and `(Red Aura)` an evil one (only
   * visible with `detect good` / `detect evil` up). Other auras — White
   * (sanctuary), Blue (bless), Pink/Green/Thorn (misc) — are not alignment.
   * The two are mutually exclusive. Latest wins; cleared on room change.
   */
  private scanMobAlignment(textRaw: string) {
    const clean = stripAnsi(String(textRaw ?? '')).toLowerCase();
    if (clean.includes('(red aura)')) this.currentTargetAlignment = 'evil';
    else if (clean.includes('(golden aura)')) this.currentTargetAlignment = 'good';
  }

  /**
   * Shared handler for both shatteredarchive:movement-succeeded and -failed, dispatched
   * by the shared movementTracker. A failure whose reasonLine is exactly '(timeout)' is
   * the tracker's OWN head-of-queue-relative timeout firing — a single stalled hop,
   * corpus-proven to happen for a genuine (non-bug) reason ~5.4% of the time — so it
   * resolves as an ordinary non-fatal 'failed', same as an explicit server failure line.
   * Only waitForMovement's own much-larger backstop timer below still produces the
   * fatal 'timeout' outcome, reserved for "the tracker itself never resolved at all."
   */
  private boundOnMovementResolved = (outcome: 'succeeded' | 'failed', ev: Event) => {
    if (!this.moveWait) return;

    const ce = ev as CustomEvent<any>;
    const { cmd, dir, ts, room, reasonLine } = extractEventMoveKey(ce?.detail);

    // If timestamp exists and it's clearly older than this wait, ignore it. Kept as
    // defense-in-depth even though the tracker's own strict FIFO + cmd/dir matching
    // below should already prevent a stray/out-of-order event from being applied to the
    // wrong wait — costs nothing and a stale event genuinely shouldn't resolve anything.
    if (typeof ts === 'number' && ts < this.moveWait.startedAt - 50) {
      dbg('movement resolution ignored (stale ts)', {
        outcome,
        ts,
        startedAt: this.moveWait.startedAt,
        expected: { cmd: this.moveWait.cmd, dir: this.moveWait.dir },
        got: { cmd, dir },
        detail: ce?.detail,
      });
      return;
    }

    const expectedCmd = this.moveWait.cmd;
    const expectedDir = this.moveWait.dir;

    const cmdMatch = !!cmd && cmd === expectedCmd;
    const dirMatch = !cmd && !!dir && !!expectedDir && dir === expectedDir;

    if (!cmdMatch && !dirMatch) {
      dbg('movement resolution ignored (no match)', {
        outcome,
        expected: { cmd: expectedCmd, dir: expectedDir },
        got: { cmd, dir, ts },
        detail: ce?.detail,
      });
      return;
    }

    const resolve = this.moveWait.resolve;

    this.clearMoveWaitTimer();
    this.moveWait = null;

    if (outcome === 'succeeded') {
      resolve({ result: 'succeeded', cmd: cmd ?? expectedCmd, room });
    } else {
      resolve({ result: 'failed', cmd: cmd ?? expectedCmd, reasonLine });
    }
  };

  private boundOnFlee = (ev: Event) => {
    if (this.stopping || this.paused) return;

    const ce = ev as CustomEvent<any>;
    dbg('event:flee observed -> pausing engine', { detail: ce?.detail });
    this.pause();
  };

  private boundOnCreatureDeath = (ev: Event) => {
    if (this.stopping || this.paused) return;

    const ce = ev as CustomEvent<any>;
    const textRaw = String(ce?.detail?.text ?? '');
    dbg('creature death observed', { detail: ce?.detail });

    if (!this.isFighting || !this.lastEncounterMatch) return;

    // GMCP char-data's isFighting is the authoritative combat signal — but it doesn't
    // reliably flip false when a PET lands the killing blow instead of the player; the
    // fight loop then waits on isFighting forever (or times out the whole run at
    // idleTimeoutMs). "<name> is DEAD!!" is a direct, GMCP-independent signal that a
    // mob just died. Match it against the target we're actually tracking (its room-scan
    // line always starts with the same name the death line does) before trusting it —
    // a different mob dying nearby (e.g. the pet's own separate kill) shouldn't end
    // tracking for the one we're still fighting.
    const deathName = normMatch(textRaw).replace(/\s+is\s+dead\s*$/, '');
    const targetLook = normMatch(this.lastEncounterMatch.lookName);
    if (deathName && targetLook.startsWith(deathName)) {
      dbg('creature death matches tracked target -> forcing isFighting=false', {
        target: this.lastEncounterMatch.targetCleanName,
      });
      this.setIsFighting(false, 'event:creature-death');
    }
  };

  private boundOnCharDataFighting = (ev: Event) => {
    if (this.stopping || this.paused) {
      return;
    }
    const ce = ev as CustomEvent<any>;
    const d = ce?.detail;

    // Authoritative: GMCP char-data property "isFighting"
    const v =
      typeof d?.isFighting === 'boolean'
        ? d.isFighting
        : typeof d?.is_fighting === 'boolean'
          ? d.is_fighting
          : typeof d?.isFighting === 'string'
            ? d.isFighting.toLowerCase() === 'true'
            : typeof d?.is_fighting === 'string'
              ? d.is_fighting.toLowerCase() === 'true'
              : null;

    if (typeof v !== 'boolean') return;

    dbg('char-data fighting observed', { type: (ev as any).type, isFighting: v });
    this.setIsFighting(v, `event:${(ev as any).type}`);
  };

  private onCharDataVitals(d: any) {
    if (!d) return;
    const hp = Number(d.hp ?? 0);
    const hpMax = Number(d.max_hp ?? 0);
    const mp = Number(d.mana ?? 0);
    const mpMax = Number(d.max_mana ?? 0);
    const mv = Number(d.move ?? 0);
    const mvMax = Number(d.max_move ?? 0);
    const carryWeight = Number(d.carry_weight ?? 0);
    const carryWeightMax = Number(d.can_carry_weight ?? 0);
    this.charVitals = { hp, hpMax, mp, mpMax, mv, mvMax, carryWeight, carryWeightMax };
    dbg('charVitals updated', this.charVitals);
    this.trackToNextLevel(d);
  }

  /**
   * A buff/fight-command action's optional AutoLevelVitalsGate — an "and" condition on
   * top of whatever else gates it (cooldown, every-N-ticks, affect-missing). Missing or
   * zero max-vitals data (no char_data seen yet) never blocks: an "above" gate is treated
   * as satisfied and a "below" gate as not-yet-known-to-be-unsatisfied, both falling out
   * of the same 100-fallback the pre-existing if_hp_pct_below-style kinds already use.
   */
  private vitalsGateSatisfied(gate?: AutoLevelVitalsGate): boolean {
    if (!gate) return true;
    const pct = this.vitalsPct(gate.stat);
    return gate.op === 'below' ? pct < gate.pct : pct > gate.pct;
  }

  /** Current hp/mp/mv as a 0-100 percentage. No max data yet (0) falls back to 100 — never blocks. */
  private vitalsPct(stat: 'hp' | 'mp' | 'mv'): number {
    const v = this.charVitals;
    if (stat === 'hp') return v.hpMax > 0 ? (v.hp / v.hpMax) * 100 : 100;
    if (stat === 'mp') return v.mpMax > 0 ? (v.mp / v.mpMax) * 100 : 100;
    return v.mvMax > 0 ? (v.mv / v.mvMax) * 100 : 100;
  }

  /**
   * Current carry-weight as a 0-100 percentage. No max-carry data yet (0) falls back to 0 —
   * unlike vitalsPct's 100-fallback, absent weight data must never look "overweight" (a
   * threshold gate that defaults to firing on missing data would be far worse than one that
   * defaults to not firing).
   */
  private weightPct(): number {
    const v = this.charVitals;
    return v.carryWeightMax > 0 ? (v.carryWeight / v.carryWeightMax) * 100 : 0;
  }

  /** ALL thresholds present on the rule must be at/below their percentage to trigger. */
  private restRuleTriggered(rule: AutoLevelRestDuringRoundRule): boolean {
    let any = false;
    if (rule.hp != null) {
      any = true;
      if (this.vitalsPct('hp') > rule.hp) return false;
    }
    if (rule.mp != null) {
      any = true;
      if (this.vitalsPct('mp') > rule.mp) return false;
    }
    if (rule.mv != null) {
      any = true;
      if (this.vitalsPct('mv') > rule.mv) return false;
    }
    return any; // an empty rule (no thresholds set) never triggers
  }

  /**
   * Polls charVitals until every present target percentage is reached, or timeoutMs
   * elapses. A pause fully suspends this wait — no action taken, timeout clock frozen
   * (paused time never counts toward it) — and resumes polling the real condition once
   * unpaused, rather than treating the pause as a reason to give up early.
   */
  private async waitForRecovery(target: { hp?: number; mp?: number; mv?: number }, timeoutMs: number): Promise<void> {
    const started = now();
    const POLL_MS = 1000;
    let pausedMs = 0;
    while (now() - started - pausedMs < timeoutMs) {
      if (this.stopping) return;
      if (this.paused) {
        const pauseStart = now();
        await this.waitWhilePausedOrStopped().catch(() => null);
        if (this.stopping) return;
        pausedMs += now() - pauseStart;
        continue;
      }
      const okHp = target.hp == null || this.vitalsPct('hp') >= target.hp;
      const okMp = target.mp == null || this.vitalsPct('mp') >= target.mp;
      const okMv = target.mv == null || this.vitalsPct('mv') >= target.mv;
      if (okHp && okMp && okMv) return;
      await this.delayMs(POLL_MS);
    }
    warn('rest: recovery wait timed out', { target, timeoutMs });
  }

  /**
   * Out-of-combat only. Checks each configured during-round rest rule in order and, on the
   * first match, runs `rest.endOfRound` (go rest/sleep), waits until every present
   * `recoverTo` percentage is reached, then runs `rest.startOfRound` (wake/stand) before
   * the round loop resumes. Only one rule fires per check.
   */
  private async checkDuringRoundRest(round: number): Promise<void> {
    if (this.stopping || this.isFighting) return;
    const cfg = this.deps.getConfig();
    const rules = cfg.rest?.duringRound ?? [];
    for (const rule of rules) {
      if (!this.restRuleTriggered(rule)) continue;
      dbg('during-round rest triggered', { rule, vitals: this.charVitals });
      this.deps.setRunState({ status: 'resting' });
      await this.runActions(cfg.rest.endOfRound, 'rest.endOfRound', round);
      await this.waitForRecovery(rule.recoverTo, Math.max(5 * 60_000, cfg.idleTimeoutMs || 0));
      if (this.stopping) return;
      await this.runActions(cfg.rest.startOfRound, 'rest.startOfRound', round);
      return;
    }
  }

  /**
   * Out-of-combat only. No separate enable flag — an empty `commands` list is off. Fires the
   * configured drop sequence once when carry-weight% crosses `atOrAbovePct` — edge-triggered via
   * `weightGateFired` so it doesn't resend the sequence on every subsequent check while still
   * overweight (e.g. if the drop command doesn't actually free up capacity). Resets once weight%
   * drops back under the threshold so it can fire again next time. Fetches config fresh each
   * call (own `getConfig()`, not the frozen round-start `cfg`) so a live edit to the weight rule
   * takes effect on the very next check.
   */
  private async checkWeightGate(round: number): Promise<void> {
    if (this.stopping || this.isFighting) return;
    const cfg = this.deps.getConfig();
    if (!cfg.weight?.commands?.length) return;
    const pct = this.weightPct();
    if (pct >= cfg.weight.atOrAbovePct) {
      if (this.weightGateFired) return;
      this.weightGateFired = true;
      dbg('weight gate triggered', { pct, atOrAbovePct: cfg.weight.atOrAbovePct });
      await this.runActions(cfg.weight.commands, 'weight.drop', round);
    } else {
      this.weightGateFired = false;
    }
  }

  /**
   * Feed every raw terminal line through the shared damage-line matcher. A "round" boundary
   * fires ROUND_GAP_MS after the last observed damage line with no new one arriving —
   * debounced: each new damage line pushes the boundary back out.
   */
  private trackRoundBoundary(textRaw: string) {
    if (!DAMAGE_LINE_RE.test(stripAnsi(String(textRaw ?? '')))) return;
    this.lastDamageTs = now();
    if (this.roundBoundaryTimer) clearTimeout(this.roundBoundaryTimer);
    this.roundBoundaryTimer = setTimeout(() => this.onRoundBoundary(), ROUND_GAP_MS);
  }

  private onRoundBoundary() {
    this.roundBoundaryTimer = null;
    this.roundsObservedThisEncounter += 1;
    this.onceFiredThisRound.clear();
    this.perCommandSentSinceRound.clear();
    dbg('round boundary', {
      roundsObserved: this.roundsObservedThisEncounter,
      commandsSent: this.commandsSentThisEncounter,
    });
  }

  /** Fresh counters for a NEW encounter — called when isFighting transitions false -> true. */
  private resetEncounterTracking() {
    if (this.roundBoundaryTimer) {
      clearTimeout(this.roundBoundaryTimer);
      this.roundBoundaryTimer = null;
    }
    this.lastDamageTs = null;
    this.roundsObservedThisEncounter = 0;
    this.commandsSentThisEncounter = 0;
    this.onceFiredThisRound.clear();
    this.onceFiredThisFight.clear();
    this.perCommandSentSinceRound.clear();
    this.commandsWithQueueBuildup.clear();
  }

  /**
   * True once this encounter has sent more combat commands than rounds it's observed
   * complete — merc-derived combat only executes ~1 lag-consuming action per real
   * round/pulse, so sends outpacing rounds means some of them are still queued.
   */
  private hasQueueBuildup(): boolean {
    return this.commandsSentThisEncounter > this.roundsObservedThisEncounter;
  }

  /**
   * Send `~` (DSL's clear-input-queue command) only if this encounter actually built up a
   * queue (hasQueueBuildup()) — a clean fight sends nothing extra. Called right after a
   * fight ends, before any further look/move. The counters it reads reset automatically at
   * the start of the NEXT encounter (resetEncounterTracking, via setIsFighting).
   */
  private async clearQueueIfBuiltUp(): Promise<void> {
    if (this.stopping || !this.hasQueueBuildup()) return;
    dbg('queue buildup detected this encounter -> sending ~ to clear it', {
      commandsSent: this.commandsSentThisEncounter,
      roundsObserved: this.roundsObservedThisEncounter,
    });
    await this.sendCommand('~');
  }

  /**
   * Whether an onceKey-gated action may fire right now — and records it as fired if so.
   * Call ONLY at the point you are actually about to send (after any kind-specific gate,
   * like cooldown/ticks/affect, has already decided to fire): a gate that skips the send
   * must not consume the once-per-X slot.
   */
  private onceGateAllows(onceKey: AutoLevelOnceKey | undefined, cmd: string): boolean {
    if (!onceKey) return true;
    const key = normCmd(cmd).toLowerCase();
    const set = onceKey === 'round' ? this.onceFiredThisRound : this.onceFiredThisFight;
    if (set.has(key)) return false;
    set.add(key);
    return true;
  }

  /** Alignment used for the kill-XP estimate: what we detected off the last mob's aura, else a config override. */
  private effectiveTargetAlignment(): AutoLevelAlignment | undefined {
    return this.currentTargetAlignment ?? this.deps.getConfig().targetAlignment;
  }

  /**
   * Track `char_data.tnl` (XP to next level). A DECREASE means XP was gained
   * without leveling — that drop is (roughly) one kill's worth of XP. An INCREASE
   * means a level-up reset tnl to the next threshold, so we ignore it. The rolling
   * estimate is kept in *base* XP (alignment modifier divided out) and the modifier
   * re-applied for the prediction.
   */
  private trackToNextLevel(d: any) {
    const tnl = Number(d?.tnl);
    if (!Number.isFinite(tnl) || tnl < 0) return;

    const prev = this.lastTnl;
    this.lastTnl = tnl;
    if (prev == null || tnl >= prev) return;

    const cfg = this.deps.getConfig();
    const mod = alignmentXpModifier(cfg.playerAlignment, this.effectiveTargetAlignment()) || 1;
    const baseDelta = (prev - tnl) / mod;

    this.killXpSamples.push(baseDelta);
    if (this.killXpSamples.length > 10) this.killXpSamples.shift();

    const avgBase = this.killXpSamples.reduce((a, b) => a + b, 0) / this.killXpSamples.length;
    this.estKillXp = avgBase * mod;
    this.sessionKills += 1;
    dbg('kill-xp sample', { drop: prev - tnl, mod, baseDelta, estKillXp: this.estKillXp });

    if (this.running) this.emitXpProgress(prev - tnl, tnl);
  }

  /**
   * Bright terminal line on every XP gain: how much dropped, and — using the same
   * rolling per-kill estimate that drives hold-near-level — roughly how many more
   * kills to the next level.
   */
  /** Bright-yellow "[auto-level] <body>" terminal line — the one visual identity shared by
   *  every player-facing engine notice (xp, cooldown learning, run-control transitions). */
  private writeAutoLevelLine(body: string) {
    const ESC = String.fromCharCode(27);
    const NOTE = `${ESC}[1;93m`; // bold bright yellow — stands out against game text
    const BODY = `${ESC}[93m`;
    const OFF = `${ESC}[0m`;
    DispatchEvent('shatteredarchive:write-terminal' as any, {
      rawText: `\r\n${NOTE}[auto-level]${OFF} ${BODY}${body}${OFF}\r\n`,
    });
  }

  private emitXpProgress(gained: number, tnl: number) {
    const est = this.estKillXp;
    const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const killsLeft = est > 0 ? Math.max(1, Math.ceil(tnl / est)) : null;

    const parts = [`+${fmt(gained)} xp`];
    if (killsLeft != null) parts.push(`~${fmt(killsLeft)} ${killsLeft === 1 ? 'kill' : 'kills'} to level`);
    parts.push(`${fmt(tnl)} tnl`);
    parts.push(`avg ${fmt(est)} xp/kill over ${this.sessionKills}`);

    this.writeAutoLevelLine(parts.join(' · '));

    this.deps.setXpProgress?.({
      gainedXp: gained,
      tnl,
      killsLeft,
      estKillXp: est,
      sessionKills: this.sessionKills,
      ts: now(),
    });
  }

  /**
   * Bright terminal line whenever the engine auto-bumps a fight-command's cooldown (queue
   * buildup — see the per-command branch of the send_cooldown case) — otherwise the player
   * has no idea why their configured cooldown quietly changed underneath them.
   */
  private emitCooldownLearnedNotice(cmd: string, fromSec: number, toSec: number) {
    this.writeAutoLevelLine(
      `heads up: "${cmd}" was queueing — bumped its cooldown ${fromSec}s → ${toSec}s (remembered for next time)`,
    );
  }

  /**
   * Seeds learnedCooldownSec from the persisted per-ability store for every `send_cooldown`
   * fight-command, so a cooldown learned in a past run (or an already-saved fight command
   * this session hasn't re-triggered yet) is applied from round 1 instead of having to
   * queue-buildup its way back to the same value all over again.
   */
  private async seedLearnedCooldowns(): Promise<void> {
    if (!this.deps.getLearnedCooldown) return;
    const exec = this.cfg?.steps?.fight?.exec ?? [];
    const keys = new Set<string>();
    for (const a of exec) {
      if (a.kind !== 'send_cooldown') continue;
      const key = normCmd(a.cmd).toLowerCase();
      if (key) keys.add(key);
    }
    for (const key of keys) {
      const learned = await this.deps.getLearnedCooldown(key);
      if (typeof learned === 'number' && Number.isFinite(learned)) {
        this.learnedCooldownSec.set(key, Math.max(learned, this.learnedCooldownSec.get(key) ?? 0));
      }
    }
  }

  /** True when we're within one estimated kill's XP of leveling up. */
  private nearLevelUp(): boolean {
    return this.estKillXp > 0 && this.lastTnl != null && this.lastTnl > 0 && this.lastTnl <= this.estKillXp;
  }

  private holdNearLevelBuffs(): AutoLevelCriticalBuff[] {
    return (this.deps.getConfig().criticalBuffs ?? []).filter((c) => c && c.holdNearLevel);
  }

  /**
   * A pre-round buff action belonging to a `holdNearLevel` critical buff, while
   * we're near a level-up — suppress it so the buff falls and mana/regen recovers
   * before the ding. Matched by affect name (`if_affect_missing`) or command.
   */
  private isHeldBuffAction(a: AutoLevelAction): boolean {
    if (!this.nearLevelUp()) return false;
    const held = this.holdNearLevelBuffs();
    if (held.length === 0) return false;

    if (a.kind === 'if_affect_missing') {
      const n = String(a.affectName ?? '').trim().toLowerCase();
      return !!n && held.some((c) => String(c.affect ?? '').trim().toLowerCase() === n);
    }
    if (a.kind === 'send' || a.kind === 'send_every_ticks') {
      const c = normCmd(a.cmd).toLowerCase();
      return !!c && held.some((x) => normCmd(x.cmd ?? '').toLowerCase() === c);
    }
    return false;
  }

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  bind() {
    if (this.isBound) {
      return;
    }

    try {
      dbg('autoleveling-engine bind()');

      this.offListeners = [
        // Incoming terminal text — shatteredarchive:raw-data is the authoritative event
        // Payload shape: { text: string, rawText: string, fromUserScript: boolean }
        ListenEvent<any>(
          'shatteredarchive:raw-data',
          (payload) => {
            this.boundOnTerminalData({ detail: payload } as any);
          },
          { key: 'AutoLevelingEngine:raw-data' },
        ),

        // GMCP char-data — authoritative source for isFighting and vitals
        // Payload shape: { hp, max_hp, mana, max_mana, move, max_move, is_fighting, ... }
        ListenEvent<any>(
          'game:char-data',
          (payload) => {
            this.onCharDataVitals(payload);
            this.boundOnCharDataFighting({ detail: payload, type: 'game:char-data' } as any);
          },
          { key: 'AutoLevelingEngine:game:char-data' },
        ),

        // Movement success/failure — the shared movementTracker (features/movement/
        // movementTracker.ts, bound once at app scope) is the authoritative source now;
        // it diffs {room,sector,exits} itself rather than treating any game:room-data
        // arrival as success (the bug this used to have).
        ListenEvent<any>(
          'shatteredarchive:movement-succeeded',
          (payload) => {
            this.boundOnMovementResolved('succeeded', { detail: payload } as any);
          },
          { key: 'AutoLevelingEngine:movement-succeeded' },
        ),
        ListenEvent<any>(
          'shatteredarchive:movement-failed',
          (payload) => {
            this.boundOnMovementResolved('failed', { detail: payload } as any);
          },
          { key: 'AutoLevelingEngine:movement-failed' },
        ),

        // Handle creature deaths
        ListenEvent<any>(
          'event:creature-death',
          (payload) => {
            this.boundOnCreatureDeath({ detail: payload } as any);
          },
          { key: 'AutoLevelingEngine:event:creature-death' },
        ),

        // GMCP affects — track active affect names for if_affect_missing
        ListenEvent<any>(
          'game:affects-trueup',
          (payload) => {
            this.activeAffects.clear();
            const list: any[] = Array.isArray(payload)
              ? payload
              : Array.isArray(payload?.affects)
                ? payload.affects
                : [];
            for (const a of list) {
              if (a?.n) this.activeAffects.add(String(a.n).trim().toLowerCase());
            }
            dbg('affects-trueup', { count: this.activeAffects.size });
          },
          { key: 'AutoLevelingEngine:game:affects-trueup' },
        ),

        ListenEvent<any>(
          'game:affect-added',
          (payload) => {
            if (payload?.n) {
              this.activeAffects.add(String(payload.n).trim().toLowerCase());
              dbg('affect-added', { n: payload.n });
            }
          },
          { key: 'AutoLevelingEngine:game:affect-added' },
        ),

        ListenEvent<any>(
          'game:affect-removed',
          (payload) => {
            if (payload?.n) {
              const n = String(payload.n).trim().toLowerCase();
              this.activeAffects.delete(n);
              dbg('affect-removed', { n: payload.n });
              this.onCriticalBuffDropped(n);
            }
          },
          { key: 'AutoLevelingEngine:game:affect-removed' },
        ),

        // GMCP tick — count ticks so `send_every_ticks` buffs can pace themselves
        ListenEvent<any>(
          'game:tick',
          () => {
            this.tickCount += 1;
            dbg('tick', { tickCount: this.tickCount });
          },
          { key: 'AutoLevelingEngine:game:tick' },
        ),

        // Pause on flee
        ListenEvent<any>(
          'event:flee:success',
          (payload) => {
            this.boundOnFlee({ detail: payload } as any);
          },
          { key: 'AutoLevelingEngine:event:flee:success' },
        ),
        // Be aware of a failed flee
        ListenEvent<any>(
          'event:flee:failed',
          (payload) => {
            this.boundOnFlee({ detail: payload } as any);
          },
          { key: 'AutoLevelingEngine:event:flee:failed' },
        ),
      ];

      this.isBound = true;
    } catch (e) {
      warn('bind failed (ignored)', e);
    }
  }

  unbind() {
    return; // TMB TODO : Review
    if (!this.isBound) return;

    try {
      dbg('unbind()');

      for (const off of this.offListeners) {
        try {
          off();
        } catch {
          // ignore
        }
      }

      this.offListeners = [];
      this.isBound = false;
    } catch (e) {
      warn('unbind failed (ignored)', e);
    }
  }

  stop() {
    dbg('stop() called');
    this.stopping = true;
    this.paused = false;
    this.running = false;
    this.deps.setRunState({ status: 'stopping' });
    this.writeAutoLevelLine('stopping...');

    // release encounter lock so future runs aren't stuck if stop occurs mid-encounter
    this.encounterLocked = false;

    this.rejectAllWaits(new Error('stopped'));
  }

  pause() {
    if (this.stopping) return;
    if (this.paused) return;
    dbg('pause()');
    this.paused = true;
    this.deps.setRunState({ status: 'paused' } as any);
    this.writeAutoLevelLine('paused');
  }

  resume() {
    if (this.stopping) return;
    if (!this.paused) return;
    dbg('resume()');
    this.paused = false;
    this.writeAutoLevelLine('resumed');
  }

  /**
   * Fires the configured identify exec commands, or a bare `look` if none are
   * configured. Shared by the manual sightsee rescan and the resume-resync below —
   * both want the exact same "refresh what I can see" behavior.
   */
  private sendIdentifyOrLook(): void {
    const cfg = this.deps.getConfig();
    const sendActions = [
      ...(cfg.steps.identify.pre ?? []),
      ...(cfg.steps.identify.exec ?? []),
      ...(cfg.steps.identify.post ?? []),
    ].filter(
      (a): a is Extract<typeof a, { kind: 'send' }> =>
        a.kind === 'send' && String((a as any).cmd ?? '').trim().length > 0,
    );

    if (sendActions.length > 0) {
      for (const a of sendActions) {
        DispatchEvent('shatteredarchive:send-command', { cmd: a.cmd });
      }
    } else {
      // No identify actions configured — send look directly.
      DispatchEvent('shatteredarchive:send-command', { cmd: 'look' });
    }
  }

  /**
   * Sightsee mode: fire the identify exec commands without advancing the path.
   * Lets the user re-scan the current room without triggering a fight.
   */
  rescanRoom() {
    if (this.stopping) return;
    this.sendIdentifyOrLook();
  }

  /** Sightsee mode: unblock the current waiting step. */
  advanceSightsee(direction: 'next' | 'prev' = 'next') {
    if (!this.sightseeWait) {
      dbg('advanceSightsee: no pending wait');
      return;
    }
    if (direction === 'prev' && !this.lastMovementCmd) {
      // Nothing to reverse — leave the wait active and tell the user.
      dbg('advanceSightsee: prev blocked — no prior movement');
      DispatchEvent('shatteredarchive:write-terminal' as any, {
        rawText: '\r\n[SIGHTSEE] Nothing to go back to — press Next to advance.\r\n',
      });
      return;
    }
    const w = this.sightseeWait;
    this.sightseeWait = null;
    w.resolve(direction);
  }

  /**
   * Normalizes `cfg.init.targets` into the case/whitespace-insensitive lookup `this.targets`
   * uses for mob-name matching. Called once at `start()` and again from `refreshRunSnapshot()`
   * (step 12) so a target added mid-run becomes engageable after a pause->resume cycle.
   */
  private refreshTargets(cfg: AutoLevelConfig) {
    this.targets = (cfg.init.targets ?? [])
      .map((t) => ({
        target: t,
        lookNameNorm: normMatch(t.lookName),
      }))
      .filter((x) => x.lookNameNorm.length > 0);

    if (this.targets.length === 0) {
      dbg('Allowed mob length is 0, this will be a sightseeing tour');
    }
  }

  /**
   * Refreshes the run's frozen config snapshot (`this.cfg`) and everything derived from it at
   * `start()` time — currently just `this.targets`. Called ONLY on an actual pause->resume
   * transition (`waitWhilePausedOrStopped()`, alongside step 8's `resyncAfterResume()`), never
   * mid-round while running unpaused — targets/buffs/route/rest-start-end-of-round are
   * deliberately NOT hot-swapped (see Constraints in the plan doc); this is the pause-to-edit
   * path for those, as opposed to step 11's no-pause-needed path for fight-commands/rest
   * during-round/weight (which already re-fetch config fresh on their own).
   */
  private refreshRunSnapshot() {
    this.cfg = this.deps.getConfig();
    this.refreshTargets(this.cfg);
  }

  async start(): Promise<void> {
    // single consistent cfg
    this.cfg = this.deps.getConfig();

    dbg('start() called', {
      mode: this.cfg.mode,
      loopRounds: this.cfg.loopRounds,
      idleTimeoutMs: this.cfg.idleTimeoutMs,
      trainingPath: this.cfg.init.trainingPath,
      initiationCommand: this.cfg.init.initiationCommand,
      targetsCount: (this.cfg.init.targets ?? []).length,
    });

    const fail = (message: string) => {
      this.deps.setRunState({ status: 'error', message });
      this.writeAutoLevelLine(`error: ${message}`);
    };

    if (this.cfg.mode === 'disabled') {
      fail('Auto leveling is disabled');
      return;
    }

    if (!this.cfg.init?.trainingPath) {
      fail('Training path is undefined');
      return;
    }

    // restored original queue init (filtering empties)
    this.trainingPathSteps = this.cfg.init.trainingPath.split(';').filter((x) => x?.trim()?.length > 0);
    if (this.trainingPathSteps.length === 0) {
      fail('Training path step length is 0');
      return;
    }

    // reset runtime flags/state
    this.stopping = false;
    this.paused = false;
    this.injectedQueue = [];
    this.encounterLocked = false;
    this.lastEncounterMatch = null;
    this.dryRunAnnouncedThisRoom.clear();
    this.sightseeWait = null;
    this.lastMovementCmd = null;
    this.cooldownLastSent.clear();
    this.tickCount = 0;
    this.everyTicksLastCast.clear();
    this.weightGateFired = false;
    this.lastTnl = null;
    this.killXpSamples = [];
    this.estKillXp = 0;
    this.sessionKills = 0;
    this.currentTargetAlignment = null;
    this.criticalBuffReactionAt.clear();
    this.learnedCooldownSec.clear();
    await this.seedLearnedCooldowns();

    // normalize targets for detection
    this.refreshTargets(this.cfg);

    // Let the games begin
    let round = 1;
    this.running = true;
    this.writeAutoLevelLine(`started (${this.cfg.mode} mode)`);

    while (!this.stopping) {
      try {
        // Rest step: wake/stand at the very top of the round, before any pre-round buffs.
        this.deps.setRunState({ status: 'running', round, step: 'rest.startOfRound', actionIndex: 0 });
        await this.runActions(this.cfg.rest?.startOfRound ?? [], 'rest.startOfRound', round);

        // Pre-round setup / buffs (steps.start). Runs at the top of every round;
        // `if_affect_missing` / `send_every_ticks` gates keep it from re-spamming.
        this.deps.setRunState({ status: 'running', round, step: 'start', actionIndex: 0 });
        await this.runTriplet(this.cfg.steps.start, 'start', round);

        while (this.trainingPathSteps.length > 0) {
          const step = this.trainingPathSteps.shift()!;

          try {
            await this.waitWhilePausedOrStopped();
          } catch (err: any) {
            dbg('engine stopping from waitWhilePausedOrStopped', { roundDelay: this.cfg.roundLoopTimeMs });
            this.deps.setRunState({ status: 'stopping' });
            break;
          }

          // Out-of-combat only — before each movement step, so a low-vitals character
          // rests before pressing on rather than walking into the next fight depleted.
          await this.checkDuringRoundRest(round);
          if (this.stopping) break;

          // Same out-of-combat check point — drop excess weight before the next move, not mid-fight.
          await this.checkWeightGate(round);
          if (this.stopping) break;

          const mv = classifyMovement(step);

          // Sightsee: pause before each movement and wait for manual advance.
          if (mv.isMove && this.cfg.mode === 'sightsee') {
            // Encode prev-availability in the step name so the UI can disable the button.
            const sightseeStep = this.lastMovementCmd ? 'sightsee:waiting' : 'sightsee:waiting:noprev';
            this.deps.setRunState({ status: 'running', round, step: sightseeStep, actionIndex: 0 });
            let advance: 'next' | 'prev';
            try {
              advance = await new Promise<'next' | 'prev'>((resolve, reject) => {
                this.sightseeWait = { promise: Promise.resolve('next'), resolve, reject };
              });
            } catch {
              break; // stopped while waiting
            }
            if (advance === 'prev') {
              // Re-insert both the current waiting step AND the last completed step so
              // the path is fully restored to the state before that last movement.
              // e.g. forward(n) → waiting(e) → prev  ⟹  path becomes ['n','e',...]
              // so the next forward re-does 'n' (step 1) rather than jumping to 'e' (step 2).
              const last = this.lastMovementCmd;
              this.trainingPathSteps.unshift(step); // put current step back first
              if (last) this.trainingPathSteps.unshift(last); // then put the completed step before it
              const rev = reverseMovementCommand(last ?? '');
              this.lastMovementCmd = null; // consumed — must go forward before prev works again
              if (rev) {
                dbg('sightsee prev', { reverse: rev });
                await this.sendCommand(rev);
              }
              continue;
            }
          }

          if (mv.isMove) {
            this.deps.setRunState({ status: 'running', round, step: 'move', actionIndex: 0 });
            await this.runActions(this.cfg.steps.move.pre, 'move.pre', round);
          }

          const gate = mv.isMove ? this.waitForMovement(step, this.cfg.idleTimeoutMs) : null;

          await this.sendCommand(step);
          if (mv.isMove) this.lastMovementCmd = step;

          if (gate) {
            const res = await gate;

            if (res.result === 'timeout') {
              this.deps.setRunState({ status: 'error', message: res.reasonLine });
              this.stopping = true;
              break;
            }

            if (res.result === 'failed') {
              warn('movement failed (non-fatal)', { cmd: res.cmd, reasonLine: res.reasonLine });
            } else {
              dbg('movement succeeded', { cmd: res.cmd, room: res.room });
              // New room — reset dry_run announced set + the last mob's aura alignment.
              this.dryRunAnnouncedThisRoom.clear();
              this.currentTargetAlignment = null;
            }
          } else {
            // Non-movement command (e.g. look) — wait for the server's response text to
            // arrive before checking for encounter detections.
            const settleMs = this.cfg.lookSettleMs ?? 500;
            if (settleMs > 0) await this.delayMs(settleMs);
          }

          if (mv.isMove && !this.stopping) {
            await this.runActions(this.cfg.steps.move.post, 'move.post', round);
          }

          await this.flushInjected(round);

          // After a successful movement, pause briefly before the next step.
          if (mv.isMove && !this.stopping) {
            const moveSettle = this.cfg.moveSettleMs ?? 600;
            if (moveSettle > 0) await this.delayMs(moveSettle);
          }
        }

        // End-of-round reset actions (steps.reset.endRound).
        this.deps.setRunState({ status: 'running', round, step: 'reset.endRound', actionIndex: 0 });
        await this.runActions(this.cfg.steps.reset.endRound, 'reset.endRound', round);

        // Rest step: rest/sleep/camp at the same point as steps.reset.endRound.
        this.deps.setRunState({ status: 'running', round, step: 'rest.endOfRound', actionIndex: 0 });
        await this.runActions(this.cfg.rest?.endOfRound ?? [], 'rest.endOfRound', round);

        if (!this.cfg.loopRounds) {
          this.stopping = true;
          break;
        }

        // Round complete — signal we are waiting before the next one starts.
        // steps.reset.wait, when configured, replaces the bare round-loop delay;
        // otherwise fall back to roundLoopTimeMs.
        this.deps.setRunState({ status: 'waiting' });
        dbg('engine waiting for next round', { roundDelay: this.cfg.roundLoopTimeMs });
        if ((this.cfg.steps.reset.wait ?? []).length > 0) {
          await this.runActions(this.cfg.steps.reset.wait, 'reset.wait', round);
        } else {
          await this.delayMs(this.cfg.roundLoopTimeMs);
        }

        this.trainingPathSteps = this.cfg.init.trainingPath.split(';').filter((x) => x?.trim()?.length > 0);
        round += 1;
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'AutoLeveling error');
        warn('fatal error', msg);
        this.deps.setRunState({ status: 'error', message: msg });
        this.writeAutoLevelLine(`error: ${msg}`);
        break;
      }
    }

    this.running = false;
    dbg('engine stopped');
    this.deps.setRunState({ status: 'idle' });
    this.writeAutoLevelLine('stopped');
  }

  /* ----------------------------- core execution ----------------------------- */

  private async waitWhilePausedOrStopped(): Promise<void> {
    const wasPaused = this.paused;
    while (!this.stopping && this.paused) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (this.stopping) throw new Error('stopped');
    if (wasPaused) {
      this.refreshRunSnapshot();
      await this.resyncAfterResume();
    }
  }

  /**
   * Every resume — flee-triggered or the manual pause/resume button — re-establishes
   * state with a fresh look/identify scan before the round loop continues from wherever
   * it actually was, rather than trusting stale pre-pause state (room, mob presence,
   * vitals may all have changed while paused).
   */
  private async resyncAfterResume(): Promise<void> {
    const cfg = this.deps.getConfig();
    dbg('resyncAfterResume: sending look/identify before continuing');
    this.sendIdentifyOrLook();
    await this.delayMs(cfg.lookSettleMs);
  }

  private async runTriplet(
    tri: { pre: AutoLevelAction[]; exec: AutoLevelAction[]; post: AutoLevelAction[] },
    label: string,
    round: number,
  ) {
    dbg('runTriplet', {
      label,
      round,
      pre: tri.pre?.length ?? 0,
      exec: tri.exec?.length ?? 0,
      post: tri.post?.length ?? 0,
    });
    await this.runActions(tri.pre, `${label}.pre`, round);
    await this.runActions(tri.exec, `${label}.exec`, round);
    await this.runActions(tri.post, `${label}.post`, round);
  }

  private async runActions(actions: AutoLevelAction[], stepLabel: string, round: number) {
    dbg('runActions begin', { stepLabel, round, count: actions?.length ?? 0 });

    for (let i = 0; i < (actions?.length ?? 0); i++) {
      if (this.stopping) return;

      await this.waitWhilePausedOrStopped();

      this.deps.setRunState({ status: 'running', round, step: stepLabel, actionIndex: i });
      dbg('run action', { round, stepLabel, i, action: actions[i] });

      await this.execAction(actions[i], round, stepLabel);

      await this.flushInjected(round);

      // Pre-round buffs (start.pre) are the one bare-`send`/`if_affect_missing` phase with
      // NO pacing at all — unlike movement (moveSettleMs) and fight-commands (auto-tuned
      // cooldowns), several buffs fire back-to-back with zero regard for real cast/violence
      // lag. With enough buffs that backlog was outrunning the round's first movement:
      // waitForMovement's backstop timer starts the instant it's called (before send), so
      // any real MUD-side lag still being worked through from buff casting ate straight into
      // that budget and could fire a hard timeout — stopping the whole run. Give each buff
      // the same settle the "look"/non-movement path already gets elsewhere.
      if (stepLabel === 'start.pre') {
        const settleMs = this.cfg.lookSettleMs ?? 500;
        if (settleMs > 0) await this.delayMs(settleMs);
      }
    }

    dbg('runActions end', { stepLabel, round });
  }

  private async execAction(a: AutoLevelAction, round: number, stepLabel = ''): Promise<void> {
    // Near a level-up: let a `holdNearLevel` buff fall instead of re-casting it.
    if (this.isHeldBuffAction(a)) {
      dbg('action held (near level-up)', a);
      return;
    }

    const gate = 'vitalsGate' in a ? a.vitalsGate : undefined;
    if (gate && !this.vitalsGateSatisfied(gate)) {
      dbg('action skipped (vitals gate)', { gate, kind: a.kind });
      return;
    }

    switch (a.kind) {
      case 'send': {
        if (!this.onceGateAllows(a.onceKey, a.cmd)) {
          dbg('send skip (once-per-X already fired)', { cmd: a.cmd, onceKey: a.onceKey });
          return;
        }
        if (REST_STEP_LABELS.has(stepLabel)) {
          await this.sendViaCommandProcessor(a.cmd);
        } else {
          await this.sendCommand(a.cmd);
        }
        return;
      }

      case 'send_cooldown': {
        const key = normCmd(a.cmd).toLowerCase();
        // The learned value (this run's cumulative bumps, seeded from what past runs
        // learned) only ever raises the effective cooldown above the configured one —
        // the config value is a floor, not a ceiling, on what we've since learned.
        const effectiveCooldownSec = Math.max(a.cooldownSec ?? 0, this.learnedCooldownSec.get(key) ?? 0);
        const cdMs = Math.max(0, effectiveCooldownSec * 1000);
        const last = this.cooldownLastSent.get(key) ?? 0;
        const elapsed = now() - last;
        if (cdMs === 0 || elapsed >= cdMs) {
          if (!this.onceGateAllows(a.onceKey, a.cmd)) {
            dbg('send_cooldown skip (once-per-X already fired)', { cmd: a.cmd, onceKey: a.onceKey });
            return;
          }
          // Per-command queue-buildup signal (step 5): this exact command re-firing before a
          // new round boundary was observed since its last send means its effective cooldown
          // is still shorter than the ability's real in-game lag.
          if (this.isFighting) {
            if (this.perCommandSentSinceRound.has(key)) {
              this.commandsWithQueueBuildup.add(key);
              const bumped = Math.round((effectiveCooldownSec + COOLDOWN_LEARN_BUMP_SEC) * 10) / 10;
              dbg('per-command queue buildup detected -> learning bumped cooldown', {
                cmd: a.cmd,
                from: effectiveCooldownSec,
                to: bumped,
              });
              this.learnedCooldownSec.set(key, bumped);
              this.emitCooldownLearnedNotice(a.cmd, effectiveCooldownSec, bumped);
              this.deps.onAbilityCooldownLearned?.(a.cmd, bumped);
            }
            this.perCommandSentSinceRound.add(key);
          }
          dbg('send_cooldown fire', { cmd: a.cmd, cooldownSec: effectiveCooldownSec, elapsedMs: elapsed });
          this.cooldownLastSent.set(key, now());
          await this.sendCommand(a.cmd);
        } else {
          dbg('send_cooldown skip (cooling)', { cmd: a.cmd, remainingMs: cdMs - elapsed });
        }
        return;
      }

      case 'send_every_ticks': {
        // Tick buffs (berserk, fury) are only worth casting out of combat.
        if (this.isFighting) {
          dbg('send_every_ticks skip (in combat)', { cmd: a.cmd });
          return;
        }
        const key = normCmd(a.cmd).toLowerCase();
        const every = Math.max(0, Math.floor(a.everyTicks ?? 0));
        const last = this.everyTicksLastCast.get(key);
        if (every === 0 || last === undefined || this.tickCount - last >= every) {
          if (!this.onceGateAllows(a.onceKey, a.cmd)) {
            dbg('send_every_ticks skip (once-per-X already fired)', { cmd: a.cmd, onceKey: a.onceKey });
            return;
          }
          dbg('send_every_ticks fire', { cmd: a.cmd, every, tickCount: this.tickCount, last });
          this.everyTicksLastCast.set(key, this.tickCount);
          await this.sendCommand(a.cmd);
        } else {
          dbg('send_every_ticks skip (waiting ticks)', { cmd: a.cmd, every, since: this.tickCount - last });
        }
        return;
      }

      case 'wait_ms':
        dbg('wait_ms', { ms: a.ms, round });
        await this.delayMs(a.ms);
        return;

      case 'wait_text':
        dbg('wait_text', { text: a.text, ci: !!a.caseInsensitive, timeoutMs: a.timeoutMs, round });
        await this.waitForText(a.text, !!a.caseInsensitive, a.timeoutMs);
        return;

      case 'wait_regex':
        dbg('wait_regex', { pattern: a.pattern, flags: a.flags, timeoutMs: a.timeoutMs, round });
        await this.waitForRegex(a.pattern, a.flags, a.timeoutMs);
        return;

      case 'wait_fighting':
        dbg('wait_fighting', { value: a.value, timeoutMs: a.timeoutMs, round, current: this.isFighting });
        await this.waitForFighting(a.value, a.timeoutMs);
        return;

      case 'if_hp_pct_below': {
        const pct = this.charVitals.hpMax > 0 ? (this.charVitals.hp / this.charVitals.hpMax) * 100 : 100;
        dbg('if_hp_pct_below', { threshold: a.pct, current: pct });
        if (pct < a.pct) await this.sendCommand(a.cmd);
        return;
      }

      case 'if_mp_pct_below': {
        const pct = this.charVitals.mpMax > 0 ? (this.charVitals.mp / this.charVitals.mpMax) * 100 : 100;
        dbg('if_mp_pct_below', { threshold: a.pct, current: pct });
        if (pct < a.pct) await this.sendCommand(a.cmd);
        return;
      }

      case 'if_mv_pct_below': {
        const pct = this.charVitals.mvMax > 0 ? (this.charVitals.mv / this.charVitals.mvMax) * 100 : 100;
        dbg('if_mv_pct_below', { threshold: a.pct, current: pct });
        if (pct < a.pct) await this.sendCommand(a.cmd);
        return;
      }

      case 'if_affect_missing': {
        const key = String(a.affectName ?? '')
          .trim()
          .toLowerCase();
        const active = key ? this.activeAffects.has(key) : false;
        dbg('if_affect_missing', { affectName: key, active });
        if (!active) {
          if (!this.onceGateAllows(a.onceKey, a.cmd)) {
            dbg('if_affect_missing skip (once-per-X already fired)', { cmd: a.cmd, onceKey: a.onceKey });
            return;
          }
          await this.sendCommand(a.cmd);
        }
        return;
      }

      default:
        dbg('unknown action kind (ignored)', a);
        return;
    }
  }

  private async sendCommand(cmd: string): Promise<void> {
    if (this.stopping) return;
    if (!String(cmd ?? '').trim()) return; // never dispatch empty commands

    // Queue-buildup signal (steps 4/5): every command sent WHILE fighting counts — movement/
    // look/engage attempts never land here with isFighting=true in normal operation, so this
    // naturally captures only fight.exec + critical-buff in-combat + mid-fight buff sends.
    if (this.isFighting) this.commandsSentThisEncounter += 1;

    // shatteredarchive:movement-attempt is now dispatched by the shared movementTracker
    // itself (off shatteredarchive:command-sent, fired from sendTelnetData once this
    // actually reaches the wire) — dispatching it here too would double-fire it.
    DispatchEvent('shatteredarchive:send-command', { cmd });
  }

  /**
   * Rest-only sibling of sendCommand — routes through the SAME alias/script "command
   * processor" a manually-typed terminal line goes through (RuntimeSingleton.Runtime
   * .executeAlias, via deps.sendThroughCommandProcessor), instead of a raw literal send. A
   * literal `sendCommand` send is exactly what broke a rest sequence built as an alias/macro:
   * the alias name itself got sent to the MUD verbatim instead of expanding. Scoped to REST
   * only (see REST_STEP_LABELS) — movement/fight-commands/buffs/weight stay on the raw path
   * deliberately, so a user's own aliases can't ever perturb the engine's carefully-tuned
   * movement/combat timing. Falls back to the plain event if no command processor is wired
   * (e.g. in tests, or a host that never provides the dep) — identical to the old behavior.
   */
  private async sendViaCommandProcessor(cmd: string): Promise<void> {
    if (this.stopping) return;
    if (!String(cmd ?? '').trim()) return;

    if (this.deps.sendThroughCommandProcessor) {
      this.deps.sendThroughCommandProcessor(cmd);
    } else {
      DispatchEvent('shatteredarchive:send-command', { cmd });
    }
  }

  private delayMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms | 0)));
  }

  /* ----------------------------- movement gating ---------------------------- */

  private waitForMovement(cmdRaw: string, timeoutMs: number): Promise<MovementResult> {
    const cmd = normCmd(cmdRaw);

    // If a gate is already active, just wait for it to resolve.
    if (this.moveWait) {
      dbg('movement gate join (already pending)', { pendingCmd: this.moveWait.cmd, nextCmd: cmd });
      return this.moveWait.promise;
    }

    // A pure backstop now — the shared movementTracker resolves the overwhelming majority
    // of moves within its own ~1200ms head-of-queue-relative window (success, an explicit
    // failure line, or its own timeout, all handled by boundOnMovementResolved above).
    // This much-larger timer should only ever fire if the tracker itself never resolves
    // at all (not bound, a dropped listener, etc.) — a genuine "stop the run" condition,
    // unlike a single slow hop.
    const t = Math.max(1000, timeoutMs || 5000);

    // expected dir for direction-only emitters (e.g. compass block)
    const mv = classifyMovement(cmd);
    const expectedDir = mv.isMove ? mv.dir : undefined;

    let resolveFn!: (r: MovementResult) => void;
    let rejectFn!: (e: any) => void;

    const promise = new Promise<MovementResult>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const timeoutId = setTimeout(() => {
      if (!this.moveWait) return;

      const expectedCmd = this.moveWait.cmd;
      const resolve2 = this.moveWait.resolve;

      this.moveWait = null;

      warn('movement gate timeout', { cmd: expectedCmd, dir: expectedDir, timeoutMs: t });
      resolve2({ result: 'timeout', cmd: expectedCmd, reasonLine: 'Movement timed out' });
    }, t);

    this.moveWait = {
      promise,
      resolve: resolveFn,
      reject: rejectFn,
      timeoutId,
      startedAt: now(),
      cmd,
      dir: expectedDir,
    };

    dbg('movement gate start', { cmd, dir: expectedDir, timeoutMs: t });

    return promise;
  }

  private clearMoveWaitTimer() {
    if (this.moveWait?.timeoutId) {
      try {
        clearTimeout(this.moveWait.timeoutId);
      } catch {
        // ignore
      }
      this.moveWait.timeoutId = null;
    }
  }

  /* ----------------------------- wait: text/regex --------------------------- */

  private waitForText(text: string, caseInsensitive: boolean, timeoutMs?: number): Promise<void> {
    if (this.waitText || this.waitRegex || this.waitFighting) {
      return Promise.reject(new Error('Only one wait can be active at a time'));
    }

    const needle = String(text ?? '');
    const ci = !!caseInsensitive;

    dbg('waitForText arm', { needle, ci, timeoutMs });

    return new Promise<void>((resolve, reject) => {
      const t = timeoutMs != null ? Math.max(1, timeoutMs) : null;
      const timeoutId =
        t != null
          ? setTimeout(() => {
              dbg('wait_text timeout', { needle, t });
              this.waitText = null;
              reject(new Error(`wait_text timeout: ${needle}`));
            }, t)
          : null;

      this.waitText = {
        kind: 'text',
        text: needle,
        caseInsensitive: ci,
        resolve: () => {
          dbg('wait_text resolved', { needle });
          this.clearWaitTimer(timeoutId);
          this.waitText = null;
          resolve();
        },
        reject: (e) => {
          dbg('wait_text rejected', { needle, e });
          this.clearWaitTimer(timeoutId);
          this.waitText = null;
          reject(e);
        },
        timeoutId,
      };
    });
  }

  private waitForRegex(pattern: string, flags?: string, timeoutMs?: number): Promise<void> {
    if (this.waitText || this.waitRegex || this.waitFighting) {
      return Promise.reject(new Error('Only one wait can be active at a time'));
    }

    const raw = String(pattern ?? '');
    let re: RegExp;

    const m = raw.match(/^\/(.+)\/([a-z]*)$/i);
    if (m) re = new RegExp(m[1], m[2] ?? '');
    else re = new RegExp(raw, String(flags ?? ''));

    dbg('waitForRegex arm', { raw, re: String(re), timeoutMs });

    return new Promise<void>((resolve, reject) => {
      const t = timeoutMs != null ? Math.max(1, timeoutMs) : null;
      const timeoutId =
        t != null
          ? setTimeout(() => {
              dbg('wait_regex timeout', { re: String(re), t });
              this.waitRegex = null;
              reject(new Error(`wait_regex timeout: ${re}`));
            }, t)
          : null;

      this.waitRegex = {
        kind: 'regex',
        re,
        resolve: () => {
          dbg('wait_regex resolved', { re: String(this.waitRegex?.re) });
          this.clearWaitTimer(timeoutId);
          this.waitRegex = null;
          resolve();
        },
        reject: (e) => {
          dbg('wait_regex rejected', { re: String(this.waitRegex?.re), e });
          this.clearWaitTimer(timeoutId);
          this.waitRegex = null;
          reject(e);
        },
        timeoutId,
      };
    });
  }

  private onTerminalLine(text: string) {
    if (this.waitText) {
      const line = String(text ?? '');
      const hay = this.waitText.caseInsensitive ? line.toLowerCase() : line;
      const needle = this.waitText.caseInsensitive ? this.waitText.text.toLowerCase() : this.waitText.text;
      if (needle.length > 0 && hay.includes(needle)) {
        dbg('terminal matched wait_text', { needle });
        this.waitText.resolve();
        return;
      }
    }

    if (this.waitRegex) {
      const line = String(text ?? '');
      if (this.waitRegex.re.test(line)) {
        dbg('terminal matched wait_regex', { re: String(this.waitRegex.re) });
        this.waitRegex.resolve();
        return;
      }
    }
  }

  /* ----------------------------- wait: fighting ----------------------------- */

  private waitForFighting(value: boolean, timeoutMs?: number): Promise<void> {
    if (this.waitText || this.waitRegex || this.waitFighting) {
      return Promise.reject(new Error('Only one wait can be active at a time'));
    }

    if (this.isFighting === value) {
      dbg('waitForFighting immediate', { value });
      return Promise.resolve();
    }

    dbg('waitForFighting arm', { value, timeoutMs });

    return new Promise<void>((resolve, reject) => {
      const t = timeoutMs != null ? Math.max(1, timeoutMs) : null;
      const timeoutId =
        t != null
          ? setTimeout(() => {
              dbg('wait_fighting timeout', { value, t, current: this.isFighting });
              this.waitFighting = null;
              reject(new Error(`wait_fighting timeout: ${String(value)}`));
            }, t)
          : null;

      this.waitFighting = {
        value,
        resolve: () => {
          dbg('wait_fighting resolved', { value });
          this.clearWaitTimer(timeoutId);
          this.waitFighting = null;
          resolve();
        },
        reject: (e) => {
          dbg('wait_fighting rejected', { value, e });
          this.clearWaitTimer(timeoutId);
          this.waitFighting = null;
          reject(e);
        },
        timeoutId,
      };
    });
  }

  private setIsFighting(next: boolean, source: string) {
    const prev = this.isFighting;
    this.isFighting = next;

    if (prev !== next) dbg('isFighting changed', { prev, next, source });

    // A brand-new encounter is starting — fresh round/queue-buildup/once-per-X tracking.
    if (!prev && next) this.resetEncounterTracking();

    if (this.waitFighting && this.isFighting === this.waitFighting.value) {
      this.waitFighting.resolve();
    }

    // Engagement success
    if (this.engageWait && next === true) {
      const elapsed = now() - this.engageWait.startedAt;
      dbg('engage success via isFighting', { elapsedMs: elapsed });
      this.resolveEngageWait({ ok: true });
    }
  }

  /* ----------------------------- critical buffs --------------------------- */

  /**
   * A GMCP affect the wizard flagged as critical (`config.criticalBuffs`) just
   * dropped. The only thing to do HERE is the mid-fight item action — a caster
   * usually can't re-cast the spell while fighting, so `inCombatCmd` (quaff a
   * potion / brandish a staff) covers the gap. Everything else — recasting the
   * spell itself — is handled by the post-combat buff recheck (`recheckBuffs`),
   * which re-runs every affect-gated `start.pre` action when a fight ends.
   */
  private onCriticalBuffDropped(affectLower: string) {
    if (this.stopping || !this.isFighting) return;

    const buff = (this.deps.getConfig().criticalBuffs ?? []).find(
      (c) => c && String(c.affect ?? '').trim().toLowerCase() === affectLower,
    );
    const inCombat = String(buff?.inCombatCmd ?? '').trim();
    if (!buff || !inCombat) return;

    if (buff.holdNearLevel && this.nearLevelUp()) {
      dbg('criticalBuff drop ignored — holding near level-up', { affect: affectLower });
      return;
    }

    const cdMs = Math.max(0, (buff.cooldownSec ?? 0) * 1000);
    const last = this.criticalBuffReactionAt.get(affectLower) ?? 0;
    if (cdMs > 0 && now() - last < cdMs) {
      dbg('criticalBuff drop throttled', { affect: affectLower });
      return;
    }

    dbg('criticalBuff drop — firing in-combat action', { affect: affectLower, cmd: inCombat });
    this.criticalBuffReactionAt.set(affectLower, now());
    void this.sendCommand(inCombat);
  }

  /**
   * Re-run the affect-gated + tick buff actions from `steps.start.pre`. Called at
   * the top of each round AND after every fight ends — a dropped sanctuary /
   * armor / etc. gets recast as soon as combat is over, not only at the next lap.
   * "Every round" buffs (bare `send`) are intentionally excluded — those the user
   * asked to fire only at the top of the round. `holdNearLevel` suppression and
   * the in-combat gate for tick buffs are handled inside `execAction`.
   */
  private async recheckBuffs(round: number, label: string) {
    const pre = this.deps.getConfig().steps.start.pre ?? [];
    const gated = pre.filter((a) => a.kind === 'if_affect_missing' || a.kind === 'send_every_ticks');
    if (gated.length === 0) return;
    dbg('recheckBuffs', { label, round, count: gated.length });
    await this.runActions(gated, label, round);
  }

  /* ----------------------------- engagement helpers ------------------------- */

  private onTerminalEngageHeuristics(textRaw: string) {
    if (!this.engageWait) return;

    const clean = normLine(textRaw);

    // Failure signal
    if (clean.includes("they aren't here") || clean.includes('they arent here')) {
      dbg('engage failure via terminal', { line: clean.slice(0, 160) });
      this.engageWait.sawNotHere = true;
      this.resolveEngageWait({ ok: false, reason: 'not_here' });
    }
  }

  private resolveEngageWait(result: { ok: boolean; reason?: string }) {
    if (!this.engageWait) return;

    const w = this.engageWait;
    this.engageWait = null;

    if (w.timeoutId) {
      try {
        clearTimeout(w.timeoutId);
      } catch {
        // ignore
      }
      w.timeoutId = null;
    }

    dbg('resolveEngageWait', result);

    try {
      w.resolve(result);
    } catch {
      // ignore
    }
  }

  private waitForEngageOutcome(timeoutMs: number, minDelayMs: number): Promise<{ ok: boolean; reason?: string }> {
    if (this.engageWait) {
      dbg('waitForEngageOutcome refused: already active');
      return Promise.resolve({ ok: false, reason: 'internal_engage_wait_exists' });
    }

    const startedAt = now();
    const t = Math.max(minDelayMs + 250, timeoutMs);

    dbg('waitForEngageOutcome arm', { timeoutMs: t, minDelayMs });

    return new Promise((resolve, reject) => {
      // Queue-depth-aware (movement-tracking-fix plan, Step 5): time spent with the
      // shared movementTracker still backed up (e.g. a movement burst sent right before
      // this attack) doesn't count against the attempt window — the server hasn't even
      // gotten to processing the kill command yet, so a command still honestly queued
      // shouldn't be abandoned. Same head-of-queue-relative principle movementTracker
      // itself uses (Step 2), applied here as a time-exclusion rather than a second
      // timer scheme. Queue empty throughout (the common case): behaves exactly as
      // before — fires once at `t`, no extra polling.
      const QUEUE_RECHECK_MS = 250;
      let backedUpMs = 0;

      const onTimeoutTick = () => {
        if (!this.engageWait) return;

        if (movementTracker.pendingCount() > 0) {
          backedUpMs += QUEUE_RECHECK_MS;
          dbg('engage timeout deferred (movement queue still backed up)', {
            pending: movementTracker.pendingCount(),
            backedUpMs,
          });
          this.engageWait.timeoutId = setTimeout(onTimeoutTick, QUEUE_RECHECK_MS);
          return;
        }

        const elapsed = now() - startedAt - backedUpMs;
        // Enforce the 500ms “GMCP grace” before we treat it as a timeout — and, once the
        // queue has drained, give the attempt the REMAINDER of its own window rather
        // than firing immediately just because backedUpMs finally stopped growing.
        if (elapsed < Math.max(minDelayMs, t)) {
          this.engageWait.timeoutId = setTimeout(onTimeoutTick, Math.max(minDelayMs, t) - elapsed);
          return;
        }

        dbg('engage timeout', { elapsedMs: elapsed, timeoutMs: t, backedUpMs, isFighting: this.isFighting });
        this.resolveEngageWait({ ok: false, reason: 'timeout' });
      };

      const timeoutId = setTimeout(onTimeoutTick, t);

      this.engageWait = {
        startedAt,
        minDelayMs,
        resolve,
        reject,
        timeoutId,
        sawNotHere: false,
      };
    });
  }

  private async engageTarget(target: AutoLevelTarget, round: number): Promise<boolean> {
    const cfg = this.deps.getConfig();

    const initiation = (cfg.init.initiationCommand ?? '').length ? String(cfg.init.initiationCommand) : 'kill {name}';

    const keywords = Array.isArray(target.keywords) ? target.keywords.slice() : [];
    const uniqueKeywords: string[] = [];
    const seen = new Set<string>();
    for (const k of keywords) {
      const kk = String(k ?? '').trim();
      if (!kk) continue;
      const key = kk.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueKeywords.push(kk);
    }

    dbg('engageTarget begin', {
      target: target.cleanName,
      lookName: target.lookName,
      keywords: uniqueKeywords,
      initiation,
    });

    const attemptTimeout = Math.min(Math.max(3000, cfg.idleTimeoutMs || 30000), 10000);
    const gmcpGraceMs = 800;

    for (let i = 0; i < uniqueKeywords.length; i++) {
      if (this.stopping) return false;

      await this.waitWhilePausedOrStopped();

      const keyword = uniqueKeywords[i];
      const cmd = applyInitiationTemplate(initiation, keyword);

      this.deps.setRunState({ status: 'running', round, step: 'fight.engage', actionIndex: i });
      dbg('engage attempt', { i, keyword, cmd });

      // Send the attempt
      await this.sendCommand(cmd);

      // Wait for either:
      // - terminal says "They aren't here" (handled by onTerminalEngageHeuristics)
      // - isFighting becomes true (handled by setIsFighting)
      const r = await this.waitForEngageOutcome(attemptTimeout, gmcpGraceMs);

      if (r.ok) {
        dbg('engage success', { keyword });
        return true;
      }

      if (r.reason === 'not_here') {
        dbg('engage not_here -> trying next keyword', { keyword });
        // Brief pause so we don't burst-fire keyword attempts back-to-back.
        await this.delayMs(600);
        continue;
      }

      dbg('engage attempt failed -> trying next keyword', { keyword, reason: r.reason });
    }

    dbg('engageTarget exhausted keywords (no success)', { target: target.cleanName });
    return false;
  }

  /* ----------------------------- injection: encounters ---------------------- */

  private tryDetectEncounter(textRaw: string) {
    const cfg = this.deps.getConfig();
    if (cfg.mode === 'disabled') return;

    if (!this.targets || this.targets.length === 0) return;

    const clean = normMatch(textRaw);
    if (!clean) return;

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (!t.lookNameNorm) continue;

      if (!clean.includes(t.lookNameNorm)) continue;

      this.lastEncounterMatch = { targetCleanName: t.target.cleanName, lookName: t.target.lookName, at: now() };

      if (cfg.mode === 'sightsee') {
        dbg('sightsee: encounter injection skipped', { target: t.target.cleanName });
        return;
      }

      if (cfg.mode === 'dry_run') {
        // Only announce each mob once per room visit.
        if (this.dryRunAnnouncedThisRoom.has(t.target.cleanName)) {
          dbg('dry_run: already announced this room, skipping', { target: t.target.cleanName });
          return;
        }
        this.dryRunAnnouncedThisRoom.add(t.target.cleanName);

        // Build the command that would have been sent.
        const initiation = (cfg.init.initiationCommand ?? '').length
          ? String(cfg.init.initiationCommand)
          : 'kill {name}';
        const firstKeyword =
          (Array.isArray(t.target.keywords) ? t.target.keywords : [])
            .map((k) => String(k ?? '').trim())
            .find((k) => k.length > 0) ?? t.target.cleanName;
        const wouldSend = applyInitiationTemplate(initiation, firstKeyword);

        dbg('dry_run: injecting notify', { target: t.target.cleanName, wouldSend });
        this.injectedQueue.unshift({ kind: '__dry_run_notify', target: t.target, wouldSend });
        return;
      }

      dbg('encounter detected (lookName match)', this.lastEncounterMatch);
      this.injectEncounter(t.target);
      return;
    }
  }

  private injectEncounter(target: AutoLevelTarget) {
    if (this.encounterLocked) {
      dbg('inject skipped: encounterLocked=true', { target: target.cleanName });
      return;
    }

    this.injectedQueue.unshift({ kind: '__engage_target', target });
    this.encounterLocked = true;

    dbg('encounter injected', {
      target: target.cleanName,
      queueLen: this.injectedQueue.length,
    });
  }

  private async flushInjected(round: number) {
    if (this.injectedQueue.length > 0) dbg('flushInjected begin', { round, queueLen: this.injectedQueue.length });

    while (!this.stopping && this.injectedQueue.length > 0) {
      await this.waitWhilePausedOrStopped();

      const a = this.injectedQueue.shift()!;

      if ((a as any).kind === '__dry_run_notify') {
        const n = a as Extract<InjectedEngineAction, { kind: '__dry_run_notify' }>;
        const msg = `\r\n[DRY RUN] Would engage: ${n.target.cleanName} — skipping: ${n.wouldSend}\r\n`;
        DispatchEvent('shatteredarchive:write-terminal' as any, { rawText: msg });
        dbg('dry_run notify written', { target: n.target.cleanName, wouldSend: n.wouldSend });
        // Brief pause so the user can read the message before the engine moves on.
        if (!this.stopping) await this.delayMs(1200);
        continue;
      }

      if ((a as any).kind === '__engage_target') {
        const eng = a as Extract<InjectedEngineAction, { kind: '__engage_target' }>;
        dbg('flushInjected engage', { target: eng.target.cleanName });

        const ok = await this.engageTarget(eng.target, round);

        if (!ok) {
          dbg('engage failed; releasing encounter lock', { target: eng.target.cleanName });
          this.encounterLocked = false;
          continue;
        }

        const cfg = this.deps.getConfig();
        const loopIntervalMs = Math.max(2000, cfg.fightLoopIntervalMs ?? 2500);

        // fight.pre — runs once on engage success
        this.deps.setRunState({ status: 'running', round, step: 'fight.pre', actionIndex: 0 });
        await this.runActions(cfg.steps.fight.pre, 'fight.pre', round);

        // fight.exec — only loop if there are actions to run.
        // If fight.exec is empty, just wait for the fight to end naturally.
        // A step is "present" only if it contains at least one action that isn't a blank send.
        // This prevents a textarea that was left empty (parser produces [] or [{kind:'send',cmd:''}])
        // from being treated as having actions and triggering a send loop.
        const hasFightExec = (cfg.steps.fight.exec ?? []).some(
          (a) => a.kind !== 'send' || String(a.cmd ?? '').trim().length > 0,
        );
        if (hasFightExec) {
          dbg('fight loop start', { target: eng.target.cleanName, loopIntervalMs });
          while (!this.stopping && this.isFighting) {
            await this.waitWhilePausedOrStopped().catch(() => null);
            if (this.stopping) break;

            this.deps.setRunState({ status: 'running', round, step: 'fight.exec', actionIndex: 0 });
            await this.runActions(cfg.steps.fight.exec, 'fight.exec', round);

            if (!this.isFighting) break;

            // Wait the loop interval, polling every 200 ms so we exit promptly
            // when fighting ends without touching the shared waitFighting slot.
            let waited = 0;
            const POLL_MS = 200;
            while (waited < loopIntervalMs && this.isFighting && !this.stopping) {
              await this.delayMs(POLL_MS);
              waited += POLL_MS;
            }
          }
          dbg('fight loop end', { target: eng.target.cleanName, isFighting: this.isFighting });
        } else {
          // No fight actions — wait for combat to end without sending anything.
          dbg('fight loop skip (no exec actions), waiting for fight end', { target: eng.target.cleanName });
          if (this.isFighting) {
            try {
              // This is a "something's actually stuck" backstop, not a fight-duration cap —
              // the "X is DEAD!!" text handler (boundOnCreatureDeath) is the normal way this
              // wait ends, the instant the mob dies, however long that takes (a tanky mob can
              // easily run past a minute). A short ceiling here would abort perfectly healthy
              // long fights with a full engine stop, so give it a generous floor and still let
              // cfg.idleTimeoutMs raise it further for anyone who needs more.
              await this.waitForFighting(false, Math.max(FIGHT_END_BACKSTOP_MS, cfg.idleTimeoutMs || 0));
            } catch {
              this.deps.setRunState({ status: 'error', message: 'Timed out waiting for fight to end' });
              this.stopping = true;
            }
          }
        }

        // fight.post — runs once when fight loop exits
        this.deps.setRunState({ status: 'running', round, step: 'fight.post', actionIndex: 0 });
        await this.runActions(cfg.steps.fight.post, 'fight.post', round);

        // Re-check the affect-gated + tick buffs now that combat is over — a
        // sanctuary / armor / etc. that fell mid-fight gets recast right away.
        this.deps.setRunState({ status: 'running', round, step: 'postFight.buffs', actionIndex: 0 });
        await this.recheckBuffs(round, 'postFight.buffs');

        // postFight triplet — loot, rest, health check
        this.deps.setRunState({ status: 'running', round, step: 'postFight', actionIndex: 0 });
        await this.runTriplet(cfg.steps.postFight, 'postFight', round);

        // Clear a built-up command queue before any further look/move.
        await this.clearQueueIfBuiltUp();

        // Brief pause after the fight before re-scanning or moving on.
        if (!this.stopping) {
          const postFightSettle = cfg.postFightSettleMs ?? 2_000;
          if (postFightSettle > 0) await this.delayMs(postFightSettle);
        }

        dbg('encounter complete; releasing lock', { target: eng.target.cleanName });
        this.encounterLocked = false;

        // Re-scan the room — there may be more mobs here before we move on.
        if (!this.stopping) {
          const cfgRecheck = this.deps.getConfig();
          this.deps.setRunState({ status: 'running', round, step: 'identify', actionIndex: 0 });
          await this.runTriplet(cfgRecheck.steps.identify, 'identify', round);
          // Wait for the server to send back the room description before we check
          // whether another mob was detected (i.e. injected into the queue).
          const settleMs = cfgRecheck.lookSettleMs ?? 500;
          if (settleMs > 0 && !this.stopping) await this.delayMs(settleMs);
          // If another mob was detected during the re-scan, it will have been injected into
          // the queue. The while-loop above will pick it up on the next iteration.
        }
        continue;
      }

      const act = a as AutoLevelAction;
      this.deps.setRunState({ status: 'running', round, step: 'fight.injected', actionIndex: 0 });
      dbg('flushInjected normal action', { act });
      await this.execAction(act, round);
    }

    dbg('flushInjected end', { round });
  }

  /* ----------------------------- cleanup ----------------------------------- */

  private clearWaitTimer(t: ReturnType<typeof setTimeout> | null) {
    if (!t) return;
    try {
      clearTimeout(t);
    } catch {
      // ignore
    }
  }

  private rejectAllWaits(err: any) {
    dbg('rejectAllWaits', { err: String(err?.message ?? err ?? err) });

    if (this.sightseeWait) {
      const rej = this.sightseeWait.reject;
      this.sightseeWait = null;
      try {
        rej(err);
      } catch {
        /* ignore */
      }
    }

    if (this.moveWait) {
      this.clearMoveWaitTimer();
      const rej = this.moveWait.reject;
      this.moveWait = null;
      try {
        rej(err);
      } catch {
        // ignore
      }
    }

    if (this.waitText) {
      this.clearWaitTimer(this.waitText.timeoutId);
      const rej = this.waitText.reject;
      this.waitText = null;
      try {
        rej(err);
      } catch {
        // ignore
      }
    }

    if (this.waitRegex) {
      this.clearWaitTimer(this.waitRegex.timeoutId);
      const rej = this.waitRegex.reject;
      this.waitRegex = null;
      try {
        rej(err);
      } catch {
        // ignore
      }
    }

    if (this.waitFighting) {
      this.clearWaitTimer(this.waitFighting.timeoutId);
      const rej = this.waitFighting.reject;
      this.waitFighting = null;
      try {
        rej(err);
      } catch {
        // ignore
      }
    }

    if (this.engageWait) {
      if (this.engageWait.timeoutId) {
        try {
          clearTimeout(this.engageWait.timeoutId);
        } catch {
          // ignore
        }
      }
      const rej = this.engageWait.reject;
      this.engageWait = null;
      try {
        rej(err);
      } catch {
        // ignore
      }
    }
  }
}
