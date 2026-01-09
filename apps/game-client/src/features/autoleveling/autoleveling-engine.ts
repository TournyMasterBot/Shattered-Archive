// apps/game-client/src/features/autoleveling/autoleveling-engine.ts

/**
 * AutoLevelingEngine (runtime)
 * ----------------------------
 * Intent:
 * - Drive an automated "round" loop using a semicolon-separated trainingPath (config.init.trainingPath).
 * - Gate movement using movement-succeeded/movement-failed events so automation doesn't outrun the client.
 * - Detect encounters from terminal text (lookName match) and inject an engagement+fight sequence.
 * - Own engagement:
 *   - For a detected target: try initiationCommand template with keywords until GMCP says fighting=true
 *   - If terminal says "They aren't here", try next keyword immediately.
 * - Provide wait primitives for scripted actions:
 *   - wait_ms, wait_text, wait_regex, wait_fighting
 *
 * Strong inferred step order:
 *  Round:
 *   A) start.pre -> start.exec -> start.post
 *   B) For each trainingPath segment (config.init.trainingPath split by ';', empty segments preserved):
 *       1) move.pre
 *       2) send segment (dispatches game:send-command, plus game:movement-attempt for directionals)
 *       3) if segment is movement:
 *            waitForMovement(...) using game:movement-succeeded/failed
 *            move.post
 *            identify.pre -> identify.exec -> identify.post
 *          else:
 *            move.post
 *       4) flushInjected()  (may run injected encounter sequence)
 *   C) reset.endRound
 *   D) reset.wait
 *
 * Encounter injection (async between any two actions/segments):
 * - on terminal-data: if lookName matches and not locked => inject __engage_target at front of queue, lock encounters
 * - flushInjected:
 *    - engageTarget() attempts keywords
 *    - if engaged, run fight triplet, then ensure fighting ends, then unlock encounters
 *    - if engage fails, unlock and continue
 */

import type { AutoLevelAction, AutoLevelConfig, AutoLevelRunState, AutoLevelTarget } from './autoleveling-types';

type EngineDeps = {
  getConfig: () => AutoLevelConfig;
  setRunState: (s: AutoLevelRunState) => void;
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
    };

const ANSI_CSI_RE = /\u001b\[[0-9;]*m/g;

/* ----------------------------- debug helpers ------------------------------ */

const ENG_LOG_PREFIX = '[autoleveling][engine]';

function isAutoLevelingDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__AUTOLEVELING_DEBUG__ === true) return true;

    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('autoleveling.debug') : null;
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;

    try {
      const dev = typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;
      return dev;
    } catch {
      return false;
    }
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

function dispatchSafe(name: string, detail?: any) {
  try {
    dbg('dispatch', { name, detail });
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (e) {
    warn('dispatch failed (ignored)', { name, e });
  }
}

function parseTrainingPath(path: string | null | undefined): string[] {
  const raw = String(path ?? '');
  if (!raw.trim()) return [];
  // preserve original segments (including empties)
  const segs = raw.split(';').map((s) => s);
  return segs;
}

const MOVE_DIRS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd', 'up', 'down']);

function isMovementCommand(cmd: string): { isMove: boolean; dir?: string } {
  const trimmed = String(cmd ?? '').trim();
  if (!trimmed) return { isMove: false };
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (MOVE_DIRS.has(first)) return { isMove: true, dir: first };
  return { isMove: false };
}

function applyInitiationTemplate(template: string, keyword: string): string {
  const k = String(keyword ?? '');
  const t = String(template ?? '');
  // Support {name} (preferred), plus some back-compat placeholders.
  return t.replace(/\{name\}/g, k).replace(/\{target\}/g, k).replace(/\{keyword\}/g, k);
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

  const dir =
    normalizeDirToken(detail?.dir) ??
    normalizeDirToken(detail?.direction) ??
    undefined;

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

  private trainingPathSteps: string[] = [];
  private stopping = false;
  private paused = false;

  private injectedQueue: InjectedEngineAction[] = [];

  private isFighting = false;

  // encounter gating
  private encounterLocked = false;
  private lastEncounterMatch: { targetCleanName: string; lookName: string; at: number } | null = null;

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
    lookNameNorm: string;
  }> = [];

  private boundOnTerminalData = (ev: Event) => {
    const ce = ev as CustomEvent<any>;
    const textRaw = ce?.detail?.text;
    if (textRaw === undefined || textRaw === null) return;
    const text = String(textRaw);

    dbg('terminal-data', { sample: stripAnsi(text).slice(0, 120) });

    // feed waits
    this.onTerminalLine(text);

    // engagement failure signal: "They aren't here"
    this.onTerminalEngageHeuristics(text);

    // encounter detection
    if (!this.encounterLocked && !this.stopping) {
      this.tryDetectEncounter(text);
    }
  };

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

  private boundOnMovementFailed = (ev: Event) => {
    if (!this.moveWait) return;

    const ce = ev as CustomEvent<any>;
    const { cmd, dir, ts, reasonLine } = extractEventMoveKey(ce?.detail);

    if (typeof ts === 'number' && ts < this.moveWait.startedAt - 50) {
      dbg('movement-failed ignored (stale ts)', {
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
      dbg('movement-failed ignored (no match)', {
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
      result: 'failed',
      cmd: cmd ?? expectedCmd,
      reasonLine: String(reasonLine ?? ''),
    });
  };

  private boundOnCharDataFighting = (ev: Event) => {
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

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  bind() {
    try {
      dbg('bind()');
      window.addEventListener('game:terminal-data', this.boundOnTerminalData as EventListener);

      window.addEventListener('game:movement-succeeded', this.boundOnMovementSucceeded as EventListener);
      window.addEventListener('game:movement-failed', this.boundOnMovementFailed as EventListener);

      // GMCP-derived combat state (authoritative)
      window.addEventListener('game:char-data', this.boundOnCharDataFighting as EventListener);
      window.addEventListener('game:gmcp-char-data', this.boundOnCharDataFighting as EventListener);
      window.addEventListener('gmcp:char_data', this.boundOnCharDataFighting as EventListener);
    } catch (e) {
      warn('bind failed (ignored)', e);
    }
  }

  unbind() {
    try {
      dbg('unbind()');

      window.removeEventListener('game:terminal-data', this.boundOnTerminalData as EventListener);

      window.removeEventListener('game:movement-succeeded', this.boundOnMovementSucceeded as EventListener);
      window.removeEventListener('game:movement-failed', this.boundOnMovementFailed as EventListener);

      window.removeEventListener('game:char-data', this.boundOnCharDataFighting as EventListener);
      window.removeEventListener('game:gmcp-char-data', this.boundOnCharDataFighting as EventListener);
      window.removeEventListener('gmcp:char_data', this.boundOnCharDataFighting as EventListener);
    } catch (e) {
      warn('unbind failed (ignored)', e);
    }
  }

  stop() {
    dbg('stop() called');
    this.stopping = true;
    this.paused = false;
    this.deps.setRunState({ status: 'stopping' });

    this.rejectAllWaits(new Error('stopped'));
  }

  pause() {
    if (this.stopping) return;
    if (this.paused) return;
    dbg('pause()');
    this.paused = true;
  }

  resume() {
    if (this.stopping) return;
    if (!this.paused) return;
    dbg('resume()');
    this.paused = false;
  }

  async start(): Promise<void> {
    // Fetch configuration
    const cfg = this.deps.getConfig();

    dbg('start() called', {
      enabled: cfg.enabled,
      loopRounds: cfg.loopRounds,
      idleTimeoutMs: cfg.idleTimeoutMs,
      trainingPath: cfg.init.trainingPath,
      initiationCommand: cfg.init.initiationCommand,
      targetsCount: (cfg.init.targets ?? []).length,
    });

    // Validate configuration and initiate state
    if (!cfg.init?.trainingPath) {
      this.deps.setRunState({ status: 'error', message: 'Training path is undefined' });
      return;
    }

    this.trainingPathSteps = cfg.init.trainingPath.split(';').filter((x) => x?.trim()?.length > 0);
    if (this.trainingPathSteps.length === 0) {
      this.deps.setRunState({ status: 'error', message: 'Training path step length is 0' });
      return;
    }

    // Set flags
    this.stopping = false;
    this.paused = false;
    this.injectedQueue = [];
    this.encounterLocked = false;
    this.lastEncounterMatch = null;

    // Set allowed mobs
    this.targets = (cfg.init.targets ?? [])
      .map((t) => ({
        target: t,
        lookNameNorm: t.lookName,
      }))
      .filter((x) => x.lookNameNorm?.length > 0);

    if (this.targets.length === 0) {
      dbg('Allowed mob length is 0, this will be a sightseeing tour');
    }

    // Let the games begin
    let round = 1;
    this.deps.setRunState({ status: 'running', round, step: 'start', actionIndex: 0 });

    // Loop rounds forever, until the user asks for stop
    while (!this.stopping) {
      try {
        this.deps.setRunState({ status: 'waiting' });
        dbg('engine waiting for next round', {
          roundDelay: cfg.roundLoopTimeMs,
        });

        // For each step, process (queue semantics)
        while (this.trainingPathSteps.length > 0) {
          // remove step immediately
          const step = this.trainingPathSteps.shift()!;

          // If the user has requested that we pause or stop, wait until they release
          try {
            await this.waitWhilePausedOrStopped();
          } catch (err: any) {
            dbg('engine stopping from waitWhilePausedOrStopped', { roundDelay: cfg.roundLoopTimeMs });
            this.deps.setRunState({ status: 'stopping' });
            break;
          }

          // Execute the step
          const mv = isMovementCommand(step);
          const gate = mv.isMove ? this.waitForMovement(step, cfg.idleTimeoutMs) : null;

          await this.sendCommand(step);

          if (gate) {
            const res = await gate;

            // "ok" means succeeded OR failed, as long as it's not a timeout.
            if (res.result === 'timeout') {
              this.deps.setRunState({ status: 'error', message: res.reasonLine });
              this.stopping = true;
              break;
            }

            if (res.result === 'failed') {
              warn('movement failed (non-fatal)', { cmd: res.cmd, reasonLine: res.reasonLine });
            } else {
              dbg('movement succeeded', { cmd: res.cmd, room: res.room });
            }
          }

          // Between steps, always allow injected encounter work to run
          // TODO :: DEBUG INJECTED COMMANDS
          await this.flushInjected(round);
        }

        // The user doesn't wish to loop rounds, so don't
        if (!cfg.loopRounds) {
          this.stopping = true;
          break;
        }

        await this.delayMs(cfg.roundLoopTimeMs);

        // Reset the round to run it back
        this.trainingPathSteps = cfg.init.trainingPath.split(';').filter((x) => x?.trim()?.length > 0);
        round += 1;
        this.deps.setRunState({ status: 'running', round, step: 'start', actionIndex: 0 });
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'AutoLeveling error');
        warn('fatal error', msg);
        this.deps.setRunState({ status: 'error', message: msg });
        break;
      }
    }

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
    switch (a.kind) {
      case 'send':
        await this.sendCommand(a.cmd);
        return;

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

      default:
        dbg('unknown action kind (ignored)', a);
        return;
    }
  }

  private async sendCommand(cmd: string): Promise<void> {
    if (this.stopping) return;

    const mv = isMovementCommand(cmd);
    if (mv.isMove) {
      dispatchSafe('game:movement-attempt', { cmd, dir: mv.dir });
    }

    dispatchSafe('game:send-command', { cmd });
  }

  private delayMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms | 0)));
  }

  /* ----------------------------- movement gating ---------------------------- */

  private waitForMovement(cmdRaw: string, timeoutMs: number): Promise<MovementResult> {
    const cmd = normCmd(cmdRaw);

    // If a gate is already active, just wait for it to resolve.
    // (No "pending" output; join the existing promise.)
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

    const attemptTimeout = Math.min(Math.max(1500, cfg.idleTimeoutMs || 30000), 8000);
    const gmcpGraceMs = 500;

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
      // With a small GMCP grace (500ms) before concluding it didn't happen.
      const r = await this.waitForEngageOutcome(attemptTimeout, gmcpGraceMs);

      if (r.ok) {
        dbg('engage success', { keyword });
        return true;
      }

      if (r.reason === 'not_here') {
        dbg('engage not_here -> trying next keyword', { keyword });
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
    if (!cfg.enabled) return;

    if (!this.targets || this.targets.length === 0) return;

    const clean = normLine(textRaw);
    if (!clean) return;

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (!t.lookNameNorm) continue;

      if (clean.includes(t.lookNameNorm)) {
        this.lastEncounterMatch = { targetCleanName: t.target.cleanName, lookName: t.target.lookName, at: now() };
        dbg('encounter detected (lookName match)', this.lastEncounterMatch);

        this.injectEncounter(t.target);
        return;
      }
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
      // If the user has requested that we pause or stop, wait until they release
      try {
        await this.waitWhilePausedOrStopped();
      } catch (err: any) {
        dbg('engine stopping from waitWhilePausedOrStopped', { round });
        this.deps.setRunState({ status: 'stopping' });
        break;
      }

      const a = this.injectedQueue.shift()!;

      /* TODO : DEBUG
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
        await this.runTriplet(cfg.steps.fight, 'fight', round);

        if (this.isFighting) {
          const gateTimeout = Math.max(1000, cfg.idleTimeoutMs || 30000);
          dbg('waiting for fighting=false to release encounter lock', { timeoutMs: gateTimeout });
          try {
            await this.waitForFighting(false, gateTimeout);
          } catch {
            this.deps.setRunState({ status: 'error', message: 'Timed out waiting for fight to end' });
            this.stopping = true;
            return;
          }
        }

        dbg('encounter complete; releasing lock', { target: eng.target.cleanName });
        this.encounterLocked = false;
        continue;
      }

      const act = a as AutoLevelAction;
      this.deps.setRunState({ status: 'running', round, step: 'fight.injected', actionIndex: 0 });
      dbg('flushInjected normal action', { act });
      await this.execAction(act, round);
      */
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
