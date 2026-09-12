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
 *       2) send segment (shatteredarchive:send-command, plus shatteredarchive:movement-attempt for directionals)
 *       3) if movement: waitForMovement(...) via game:room-data ; else: delay lookSettleMs
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
  AutoLevelRunState,
  AutoLevelTarget,
  AutoLevelXpProgress,
} from './autoleveling-types';
import { alignmentXpModifier } from './autoleveling-alignment';

type EngineDeps = {
  getConfig: () => AutoLevelConfig;
  setRunState: (s: AutoLevelRunState) => void;
  setXpProgress?: (p: AutoLevelXpProgress) => void;
};

type MovementResult =
  | { result: 'succeeded'; cmd: string; room?: string }
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

const MOVE_DIRS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd', 'up', 'down']);

/** Backstop for "waiting for a fight to end with no fight.exec configured" — see call site. */
const FIGHT_END_BACKSTOP_MS = 10 * 60_000;

function isMovementCommand(cmd: string): { isMove: boolean; dir?: string } {
  const trimmed = String(cmd ?? '').trim();
  if (!trimmed) return { isMove: false };
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (MOVE_DIRS.has(first)) return { isMove: true, dir: first };
  return { isMove: false };
}

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

  // GMCP vitals — updated by game:char-data events
  private charVitals = { hp: 0, hpMax: 0, mp: 0, mpMax: 0, mv: 0, mvMax: 0 };

  /** last-sent timestamp (ms) per command, for `send_cooldown` actions. Cleared each run. */
  private cooldownLastSent = new Map<string, number>();

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

  private boundOnMovementSucceeded = (ev: Event) => {
    if (!this.moveWait) return;

    const ce = ev as CustomEvent<any>;
    const { cmd, dir, ts, room } = extractEventMoveKey(ce?.detail);

    // If timestamp exists and it's clearly older than this wait, ignore it.
    if (typeof ts === 'number' && ts < this.moveWait.startedAt - 50) {
      dbg('movement-succeeded ignored (stale ts)', {
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
      dbg('movement-succeeded ignored (no match)', {
        expected: { cmd: expectedCmd, dir: expectedDir },
        got: { cmd, dir, ts },
        detail: ce?.detail,
      });
      return;
    }

    const resolve = this.moveWait.resolve;

    this.clearMoveWaitTimer();
    this.moveWait = null;

    resolve({
      result: 'succeeded',
      cmd: cmd ?? expectedCmd,
      room: room,
    });
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
    this.charVitals = { hp, hpMax, mp, mpMax, mv, mvMax };
    dbg('charVitals updated', this.charVitals);
    this.trackToNextLevel(d);
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
  private emitXpProgress(gained: number, tnl: number) {
    const est = this.estKillXp;
    const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const killsLeft = est > 0 ? Math.max(1, Math.ceil(tnl / est)) : null;

    const ESC = String.fromCharCode(27);
    const NOTE = `${ESC}[1;93m`; // bold bright yellow — stands out against game text
    const BODY = `${ESC}[93m`;
    const OFF = `${ESC}[0m`;

    const parts = [`+${fmt(gained)} xp`];
    if (killsLeft != null) parts.push(`~${fmt(killsLeft)} ${killsLeft === 1 ? 'kill' : 'kills'} to level`);
    parts.push(`${fmt(tnl)} tnl`);
    parts.push(`avg ${fmt(est)} xp/kill over ${this.sessionKills}`);

    const line = `\r\n${NOTE}[auto-level]${OFF} ${BODY}${parts.join(' · ')}${OFF}\r\n`;
    DispatchEvent('shatteredarchive:write-terminal' as any, { rawText: line });

    this.deps.setXpProgress?.({
      gainedXp: gained,
      tnl,
      killsLeft,
      estKillXp: est,
      sessionKills: this.sessionKills,
      ts: now(),
    });
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

        // Movement success — fires from game:room-data (new room arrived after a move)
        ListenEvent<any>(
          'game:room-data',
          (payload) => {
            this.boundOnMovementSucceeded({
              detail: { cmd: this.moveWait?.cmd, dir: this.moveWait?.dir, ts: now() + 100, room: payload },
            } as any);
          },
          { key: 'AutoLevelingEngine:room-data' },
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
  }

  resume() {
    if (this.stopping) return;
    if (!this.paused) return;
    dbg('resume()');
    this.paused = false;
  }

  /**
   * Sightsee mode: fire the identify exec commands without advancing the path.
   * Lets the user re-scan the current room without triggering a fight.
   */
  rescanRoom() {
    if (this.stopping) return;
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

  async start(): Promise<void> {
    // single consistent cfg
    const cfg = this.deps.getConfig();

    dbg('start() called', {
      mode: cfg.mode,
      loopRounds: cfg.loopRounds,
      idleTimeoutMs: cfg.idleTimeoutMs,
      trainingPath: cfg.init.trainingPath,
      initiationCommand: cfg.init.initiationCommand,
      targetsCount: (cfg.init.targets ?? []).length,
    });

    if (cfg.mode === 'disabled') {
      this.deps.setRunState({ status: 'error', message: 'Auto leveling is disabled' });
      return;
    }

    if (!cfg.init?.trainingPath) {
      this.deps.setRunState({ status: 'error', message: 'Training path is undefined' });
      return;
    }

    // restored original queue init (filtering empties)
    this.trainingPathSteps = cfg.init.trainingPath.split(';').filter((x) => x?.trim()?.length > 0);
    if (this.trainingPathSteps.length === 0) {
      this.deps.setRunState({ status: 'error', message: 'Training path step length is 0' });
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
    this.lastTnl = null;
    this.killXpSamples = [];
    this.estKillXp = 0;
    this.sessionKills = 0;
    this.currentTargetAlignment = null;
    this.criticalBuffReactionAt.clear();

    // normalize targets for detection
    this.targets = (cfg.init.targets ?? [])
      .map((t) => ({
        target: t,
        lookNameNorm: normMatch(t.lookName),
      }))
      .filter((x) => x.lookNameNorm.length > 0);

    if (this.targets.length === 0) {
      dbg('Allowed mob length is 0, this will be a sightseeing tour');
    }

    // Let the games begin
    let round = 1;
    this.running = true;

    while (!this.stopping) {
      try {
        // Pre-round setup / buffs (steps.start). Runs at the top of every round;
        // `if_affect_missing` / `send_every_ticks` gates keep it from re-spamming.
        this.deps.setRunState({ status: 'running', round, step: 'start', actionIndex: 0 });
        await this.runTriplet(cfg.steps.start, 'start', round);

        while (this.trainingPathSteps.length > 0) {
          const step = this.trainingPathSteps.shift()!;

          try {
            await this.waitWhilePausedOrStopped();
          } catch (err: any) {
            dbg('engine stopping from waitWhilePausedOrStopped', { roundDelay: cfg.roundLoopTimeMs });
            this.deps.setRunState({ status: 'stopping' });
            break;
          }

          const mv = isMovementCommand(step);

          // Sightsee: pause before each movement and wait for manual advance.
          if (mv.isMove && cfg.mode === 'sightsee') {
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
            await this.runActions(cfg.steps.move.pre, 'move.pre', round);
          }

          const gate = mv.isMove ? this.waitForMovement(step, cfg.idleTimeoutMs) : null;

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
            const settleMs = cfg.lookSettleMs ?? 500;
            if (settleMs > 0) await this.delayMs(settleMs);
          }

          if (mv.isMove && !this.stopping) {
            await this.runActions(cfg.steps.move.post, 'move.post', round);
          }

          await this.flushInjected(round);

          // After a successful movement, pause briefly before the next step.
          if (mv.isMove && !this.stopping) {
            const moveSettle = cfg.moveSettleMs ?? 600;
            if (moveSettle > 0) await this.delayMs(moveSettle);
          }
        }

        // End-of-round reset actions (steps.reset.endRound).
        this.deps.setRunState({ status: 'running', round, step: 'reset.endRound', actionIndex: 0 });
        await this.runActions(cfg.steps.reset.endRound, 'reset.endRound', round);

        if (!cfg.loopRounds) {
          this.stopping = true;
          break;
        }

        // Round complete — signal we are waiting before the next one starts.
        // steps.reset.wait, when configured, replaces the bare round-loop delay;
        // otherwise fall back to roundLoopTimeMs.
        this.deps.setRunState({ status: 'waiting' });
        dbg('engine waiting for next round', { roundDelay: cfg.roundLoopTimeMs });
        if ((cfg.steps.reset.wait ?? []).length > 0) {
          await this.runActions(cfg.steps.reset.wait, 'reset.wait', round);
        } else {
          await this.delayMs(cfg.roundLoopTimeMs);
        }

        this.trainingPathSteps = cfg.init.trainingPath.split(';').filter((x) => x?.trim()?.length > 0);
        round += 1;
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'AutoLeveling error');
        warn('fatal error', msg);
        this.deps.setRunState({ status: 'error', message: msg });
        break;
      }
    }

    this.running = false;
    dbg('engine stopped');
    this.deps.setRunState({ status: 'idle' });
  }

  /* ----------------------------- core execution ----------------------------- */

  private async waitWhilePausedOrStopped(): Promise<void> {
    while (!this.stopping && this.paused) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (this.stopping) throw new Error('stopped');
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

      await this.execAction(actions[i], round);

      await this.flushInjected(round);
    }

    dbg('runActions end', { stepLabel, round });
  }

  private async execAction(a: AutoLevelAction, round: number): Promise<void> {
    // Near a level-up: let a `holdNearLevel` buff fall instead of re-casting it.
    if (this.isHeldBuffAction(a)) {
      dbg('action held (near level-up)', a);
      return;
    }

    switch (a.kind) {
      case 'send':
        await this.sendCommand(a.cmd);
        return;

      case 'send_cooldown': {
        const key = normCmd(a.cmd).toLowerCase();
        const cdMs = Math.max(0, (a.cooldownSec ?? 0) * 1000);
        const last = this.cooldownLastSent.get(key) ?? 0;
        const elapsed = now() - last;
        if (cdMs === 0 || elapsed >= cdMs) {
          dbg('send_cooldown fire', { cmd: a.cmd, cooldownSec: a.cooldownSec, elapsedMs: elapsed });
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
        if (!active) await this.sendCommand(a.cmd);
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

    const mv = isMovementCommand(cmd);
    if (mv.isMove) {
      DispatchEvent('shatteredarchive:movement-attempt', { cmd, dir: mv.dir });
    }
    DispatchEvent('shatteredarchive:send-command', { cmd });
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

    const t = Math.max(1000, timeoutMs || 5000);

    // expected dir for direction-only emitters (e.g. compass block)
    const mv = isMovementCommand(cmd);
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
      const timeoutId = setTimeout(() => {
        if (!this.engageWait) return;

        const elapsed = now() - startedAt;
        // Enforce the 500ms “GMCP grace” before we treat it as a timeout.
        if (elapsed < minDelayMs) return;

        dbg('engage timeout', { elapsedMs: elapsed, timeoutMs: t, isFighting: this.isFighting });
        this.resolveEngageWait({ ok: false, reason: 'timeout' });
      }, t);

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
