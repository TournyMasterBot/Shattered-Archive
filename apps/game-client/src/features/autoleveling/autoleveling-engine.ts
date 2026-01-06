// apps/game-client/src/features/autoleveling/autoleveling-engine.ts
import type { AutoLevelAction, AutoLevelConfig, AutoLevelRunState, AutoLevelTarget } from './autoleveling-types';

type EngineDeps = {
  getConfig: () => AutoLevelConfig;
  setRunState: (s: AutoLevelRunState) => void;
};

type MovementResult =
  | { ok: true; room?: string; cmd?: string }
  | { ok: false; reasonLine?: string; cmd?: string };

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
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // ignore
  }
}

function parseTrainingPath(path: string | null | undefined): string[] {
  const raw = String(path ?? '');
  if (!raw.trim()) return [];
  // preserve original segments (including empties)
  return raw.split(';').map((s) => s);
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

export class AutoLevelingEngine {
  private deps: EngineDeps;

  private stopping = false;
  private paused = false;

  private injectedQueue: InjectedEngineAction[] = [];

  private isFighting = false;

  // encounter gating
  private encounterLocked = false;
  private lastEncounterMatch: { targetCleanName: string; lookName: string; at: number } | null = null;

  // movement gating
  private moveWait:
    | null
    | {
        resolve: (r: MovementResult) => void;
        reject: (e: any) => void;
        timeoutId: ReturnType<typeof setTimeout> | null;
        startedAt: number;
        cmd: string;
      } = null;

  // generic waits used by action scripts (advanced)
  private waitText:
    | null
    | {
        kind: 'text';
        text: string;
        caseInsensitive: boolean;
        resolve: () => void;
        reject: (e: any) => void;
        timeoutId: ReturnType<typeof setTimeout> | null;
      } = null;

  private waitRegex:
    | null
    | {
        kind: 'regex';
        re: RegExp;
        resolve: () => void;
        reject: (e: any) => void;
        timeoutId: ReturnType<typeof setTimeout> | null;
      } = null;

  private waitFighting:
    | null
    | {
        value: boolean;
        resolve: () => void;
        reject: (e: any) => void;
        timeoutId: ReturnType<typeof setTimeout> | null;
      } = null;

  // engagement wait (keyword attempts)
  private engageWait:
    | null
    | {
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
    const cmd = String(ce?.detail?.cmd ?? '');
    if (cmd !== this.moveWait.cmd) {
      dbg('movement-succeeded ignored (cmd mismatch)', { got: cmd, expected: this.moveWait.cmd });
      return;
    }

    dbg('movement-succeeded', { cmd, room: ce?.detail?.room, ms: now() - this.moveWait.startedAt });

    this.clearMoveWaitTimer();
    const resolve = this.moveWait.resolve;
    this.moveWait = null;
    resolve({ ok: true, room: ce?.detail?.room, cmd });
  };

  private boundOnMovementFailed = (ev: Event) => {
    if (!this.moveWait) return;

    const ce = ev as CustomEvent<any>;
    const cmd = String(ce?.detail?.cmd ?? '');
    if (cmd !== this.moveWait.cmd) {
      dbg('movement-failed ignored (cmd mismatch)', { got: cmd, expected: this.moveWait.cmd });
      return;
    }

    dbg('movement-failed', {
      cmd,
      reasonLine: String(ce?.detail?.reasonLine ?? ''),
      ms: now() - this.moveWait.startedAt,
    });

    this.clearMoveWaitTimer();
    const resolve = this.moveWait.resolve;
    this.moveWait = null;
    resolve({ ok: false, reasonLine: String(ce?.detail?.reasonLine ?? ''), cmd });
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
    } catch {
      // ignore
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
    } catch {
      // ignore
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
    const cfg = this.deps.getConfig();

    dbg('start() called', {
      enabled: cfg.enabled,
      loopRounds: cfg.loopRounds,
      idleTimeoutMs: cfg.idleTimeoutMs,
      trainingPath: cfg.init.trainingPath,
      initiationCommand: cfg.init.initiationCommand,
      targetsCount: (cfg.init.targets ?? []).length,
    });

    if (!cfg.enabled) {
      this.deps.setRunState({ status: 'error', message: 'AutoLeveling is disabled in config' });
      return;
    }

    this.stopping = false;
    this.paused = false;
    this.injectedQueue = [];
    this.encounterLocked = false;
    this.lastEncounterMatch = null;

    this.targets = (cfg.init.targets ?? [])
      .map((t) => ({ target: t, lookNameNorm: normLine(t.lookName) }))
      .filter((x) => x.lookNameNorm.length > 0);

    dbg('targets normalized', { count: this.targets.length });

    let round = 1;
    this.deps.setRunState({ status: 'running', round, step: 'start', actionIndex: 0 });

    while (!this.stopping) {
      const config = this.deps.getConfig();

      try {
        await this.waitWhilePausedOrStopped();

        dbg('round begin', { round });

        await this.runTriplet(config.steps.start, 'start', round);

        const pathSegments = parseTrainingPath(config.init.trainingPath);
        dbg('training path parsed', { count: pathSegments.length });

        if (pathSegments.length === 0) {
          await this.runActions(config.steps.reset.endRound, 'reset.endRound', round);
          await this.runActions(config.steps.reset.wait, 'reset.wait', round);
        } else {
          for (let i = 0; i < pathSegments.length; i++) {
            if (this.stopping) break;

            await this.waitWhilePausedOrStopped();

            const seg = pathSegments[i];

            dbg('segment', {
              round,
              index: i,
              seg,
              isMove: isMovementCommand(seg).isMove,
              encounterLocked: this.encounterLocked,
              injectedQueueLen: this.injectedQueue.length,
            });

            await this.runActions(config.steps.move.pre, `move.pre`, round);

            await this.sendCommand(seg);

            const mv = isMovementCommand(seg);
            if (mv.isMove) {
              const res = await this.waitForMovement(seg, config.idleTimeoutMs);
              if (!res.ok) {
                const msg = res.reasonLine ? `Movement failed: ${res.reasonLine}` : 'Movement failed';
                warn('movement fatal', { cmd: seg, msg });
                this.deps.setRunState({ status: 'error', message: msg });
                this.stopping = true;
                break;
              }

              await this.runActions(config.steps.move.post, `move.post`, round);

              // Identify only after movement commands
              await this.runTriplet(config.steps.identify, 'identify', round);
            } else {
              await this.runActions(config.steps.move.post, `move.post`, round);
            }

            // Always drain injected work between steps
            await this.flushInjected(round);
          }

          if (!this.stopping) {
            await this.runActions(config.steps.reset.endRound, 'reset.endRound', round);
            await this.runActions(config.steps.reset.wait, 'reset.wait', round);
          }
        }

        if (this.stopping) break;

        if (!this.deps.getConfig().loopRounds) {
          dbg('loopRounds=false, exiting after round', { round });
          break;
        }

        round += 1;
        this.deps.setRunState({ status: 'running', round, step: 'start', actionIndex: 0 });
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'AutoLeveling error');
        warn('fatal error', msg);
        this.deps.setRunState({ status: 'error', message: msg });
        break;
      }
    }

    if (!this.stopping) {
      dbg('engine idle');
      this.deps.setRunState({ status: 'idle' });
    } else {
      dbg('engine stopped');
    }
  }

  /* ----------------------------- core execution ----------------------------- */

  private async waitWhilePausedOrStopped(): Promise<void> {
    while (!this.stopping && this.paused) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (this.stopping) throw new Error('stopped');
  }

  private async runTriplet(tri: { pre: AutoLevelAction[]; exec: AutoLevelAction[]; post: AutoLevelAction[] }, label: string, round: number) {
    await this.runActions(tri.pre, `${label}.pre`, round);
    await this.runActions(tri.exec, `${label}.exec`, round);
    await this.runActions(tri.post, `${label}.post`, round);
  }

  private async runActions(actions: AutoLevelAction[], stepLabel: string, round: number) {
    for (let i = 0; i < (actions?.length ?? 0); i++) {
      if (this.stopping) return;

      await this.waitWhilePausedOrStopped();

      this.deps.setRunState({ status: 'running', round, step: stepLabel, actionIndex: i });
      dbg('run action', { round, stepLabel, i, action: actions[i] });

      await this.execAction(actions[i], round);

      await this.flushInjected(round);
    }
  }

  private async execAction(a: AutoLevelAction, round: number): Promise<void> {
    switch (a.kind) {
      case 'send':
        await this.sendCommand(a.cmd);
        return;

      case 'wait_ms':
        await this.delayMs(a.ms);
        return;

      case 'wait_text':
        await this.waitForText(a.text, !!a.caseInsensitive, a.timeoutMs);
        return;

      case 'wait_regex':
        await this.waitForRegex(a.pattern, a.flags, a.timeoutMs);
        return;

      case 'wait_fighting':
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

  private waitForMovement(cmd: string, timeoutMs: number): Promise<MovementResult> {
    if (this.moveWait) {
      warn('waitForMovement called but move already pending', { existing: this.moveWait.cmd, next: cmd });
      return Promise.resolve({ ok: false, reasonLine: 'Internal error: move already pending', cmd });
    }

    return new Promise<MovementResult>((resolve, reject) => {
      const t = Math.max(1000, timeoutMs || 5000);

      const timeoutId = setTimeout(() => {
        if (!this.moveWait) return;
        const r = this.moveWait.resolve;
        this.moveWait = null;
        warn('movement gate timeout', { cmd, timeoutMs: t });
        r({ ok: false, reasonLine: 'Movement timed out', cmd });
      }, t);

      this.moveWait = { resolve, reject, timeoutId, startedAt: now(), cmd };
    });
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

    return new Promise<void>((resolve, reject) => {
      const t = timeoutMs != null ? Math.max(1, timeoutMs) : null;
      const timeoutId =
        t != null
          ? setTimeout(() => {
              this.waitText = null;
              reject(new Error(`wait_text timeout: ${needle}`));
            }, t)
          : null;

      this.waitText = {
        kind: 'text',
        text: needle,
        caseInsensitive: ci,
        resolve: () => {
          this.clearWaitTimer(timeoutId);
          this.waitText = null;
          resolve();
        },
        reject: (e) => {
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

    return new Promise<void>((resolve, reject) => {
      const t = timeoutMs != null ? Math.max(1, timeoutMs) : null;
      const timeoutId =
        t != null
          ? setTimeout(() => {
              this.waitRegex = null;
              reject(new Error(`wait_regex timeout: ${re}`));
            }, t)
          : null;

      this.waitRegex = {
        kind: 'regex',
        re,
        resolve: () => {
          this.clearWaitTimer(timeoutId);
          this.waitRegex = null;
          resolve();
        },
        reject: (e) => {
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
        this.waitText.resolve();
        return;
      }
    }

    if (this.waitRegex) {
      const line = String(text ?? '');
      if (this.waitRegex.re.test(line)) {
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

    if (this.isFighting === value) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const t = timeoutMs != null ? Math.max(1, timeoutMs) : null;
      const timeoutId =
        t != null
          ? setTimeout(() => {
              this.waitFighting = null;
              reject(new Error(`wait_fighting timeout: ${String(value)}`));
            }, t)
          : null;

      this.waitFighting = {
        value,
        resolve: () => {
          this.clearWaitTimer(timeoutId);
          this.waitFighting = null;
          resolve();
        },
        reject: (e) => {
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
      // optional minimum delay isn't needed for success; but log the race timing
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

    try {
      w.resolve(result);
    } catch {
      // ignore
    }
  }

  private waitForEngageOutcome(timeoutMs: number, minDelayMs: number): Promise<{ ok: boolean; reason?: string }> {
    if (this.engageWait) {
      return Promise.resolve({ ok: false, reason: 'internal_engage_wait_exists' });
    }

    const startedAt = now();
    const t = Math.max(minDelayMs + 250, timeoutMs);

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

      // timeout or internal; try next keyword
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

    // Engage is now internal and owned by engine.
    this.injectedQueue.unshift({ kind: '__engage_target', target });

    this.encounterLocked = true;

    dbg('encounter injected', {
      target: target.cleanName,
      queueLen: this.injectedQueue.length,
    });
  }

  private async flushInjected(round: number) {
    while (!this.stopping && this.injectedQueue.length > 0) {
      await this.waitWhilePausedOrStopped();

      const a = this.injectedQueue.shift()!;

      if ((a as any).kind === '__engage_target') {
        const eng = a as Extract<InjectedEngineAction, { kind: '__engage_target' }>;
        dbg('flushInjected engage', { target: eng.target.cleanName });

        const ok = await this.engageTarget(eng.target, round);

        if (!ok) {
          // Failed to engage; release the lock so we can detect future encounters.
          dbg('engage failed; releasing encounter lock', { target: eng.target.cleanName });
          this.encounterLocked = false;
          continue;
        }

        // Engaged successfully.
        // Run optional fight triplet (advanced actions), then ensure we wait for fighting to end.
        const cfg = this.deps.getConfig();
        await this.runTriplet(cfg.steps.fight, 'fight', round);

        // If still fighting, wait for it to end (engine-owned safety)
        if (this.isFighting) {
          const gateTimeout = Math.max(1000, cfg.idleTimeoutMs || 30000);
          dbg('waiting for fighting=false to release encounter lock', { timeoutMs: gateTimeout });
          try {
            await this.waitForFighting(false, gateTimeout);
          } catch {
            // If we time out here, it's safer to keep locked and surface an error.
            this.deps.setRunState({ status: 'error', message: 'Timed out waiting for fight to end' });
            this.stopping = true;
            return;
          }
        }

        dbg('encounter complete; releasing lock', { target: eng.target.cleanName });
        this.encounterLocked = false;
        continue;
      }

      // Normal actions in the injected queue
      const act = a as AutoLevelAction;
      this.deps.setRunState({ status: 'running', round, step: 'fight.injected', actionIndex: 0 });
      await this.execAction(act, round);
    }
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
