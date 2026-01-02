import type { AutoLevelAction, AutoLevelConfig, AutoLevelRunState } from './autoleveling-types';
import { cleanText } from './autoleveling-text';

type SendFn = (cmd: string) => void;
type OnStateFn = (s: AutoLevelRunState) => void;

type Waiter =
  | { kind: 'none' }
  | { kind: 'text'; text: string; caseInsensitive: boolean; deadline: number }
  | { kind: 'regex'; re: RegExp; deadline: number };

export class AutoLevelingEngine {
  private cfg: AutoLevelConfig;
  private readonly send: SendFn;
  private readonly onState: OnStateFn;

  private state: AutoLevelRunState = { status: 'idle' };
  private stopping = false;

  private round = 0;
  private queue: AutoLevelAction[] = [];
  private actionIndex = 0;

  private waiter: Waiter = { kind: 'none' };
  private lastTerminalAt = Date.now();
  private pendingTimer: number | null = null;

  private firedOncePerRound = new Set<string>();
  private firedOncePerFight = new Set<string>();

  constructor(cfg: AutoLevelConfig, send: SendFn, onState: OnStateFn) {
    this.cfg = cfg;
    this.send = send;
    this.onState = onState;
  }

  updateConfig(cfg: AutoLevelConfig): void {
    this.cfg = cfg;
  }

  getState(): AutoLevelRunState {
    return this.state;
  }

  start(): void {
    if (this.state.status === 'running') return;
    this.stopping = false;
    this.round = 0;
    this.firedOncePerRound.clear();
    this.firedOncePerFight.clear();
    this.beginNextRound();
  }

  stop(): void {
    this.stopping = true;
    this.setState({ status: 'stopping' });
    this.clearTimer();
    this.waiter = { kind: 'none' };
    this.queue = [];
  }

  onTerminalData(raw: string): void {
    this.lastTerminalAt = Date.now();
    if (this.waiter.kind === 'none') return;

    const text = cleanText(raw);

    if (this.waiter.kind === 'text') {
      const hay = this.waiter.caseInsensitive ? text.toLowerCase() : text;
      const needle = this.waiter.caseInsensitive ? this.waiter.text.toLowerCase() : this.waiter.text;
      if (hay.includes(needle)) {
        this.waiter = { kind: 'none' };
        this.stepNext();
      }
      return;
    }

    if (this.waiter.kind === 'regex') {
      if (this.waiter.re.test(text)) {
        this.waiter = { kind: 'none' };
        this.stepNext();
      }
    }
  }

  onVitals(v: { hp?: number; hpMax?: number; mp?: number; mpMax?: number; stamina?: number; staminaMax?: number }) {
    if (this.state.status !== 'running') return;

    const hp = Number(v.hp ?? 0);
    const hpMax = Math.max(1, Number(v.hpMax ?? 1));
    const mp = Number(v.mp ?? 0);
    const mpMax = Math.max(1, Number(v.mpMax ?? 1));
    const stam = Number(v.stamina ?? 0);
    const stamMax = Math.max(1, Number(v.staminaMax ?? 1));

    const hpPct = Math.floor((hp / hpMax) * 100);
    const mpPct = Math.floor((mp / mpMax) * 100);
    const stamPct = Math.floor((stam / stamMax) * 100);

    const statValue = (stat: string) => {
      switch (stat) {
        case 'hp':
          return hp;
        case 'mp':
          return mp;
        case 'stam':
          return stam;
        case 'hpPct':
          return hpPct;
        case 'mpPct':
          return mpPct;
        case 'stamPct':
          return stamPct;
        default:
          return 0;
      }
    };

    for (const rule of this.cfg.init.abilityThresholds) {
      if (!rule.enabled) continue;

      if (rule.throttle === 'once_per_round' && this.firedOncePerRound.has(rule.id)) continue;
      if (rule.throttle === 'once_per_fight' && this.firedOncePerFight.has(rule.id)) continue;

      const cur = statValue(rule.stat);
      const ok =
        rule.op === '>='
          ? cur >= rule.value
          : rule.op === '>'
            ? cur > rule.value
            : rule.op === '<='
              ? cur <= rule.value
              : cur < rule.value;

      if (!ok) continue;

      this.send(rule.cmd);
      if (rule.throttle === 'once_per_round') this.firedOncePerRound.add(rule.id);
      if (rule.throttle === 'once_per_fight') this.firedOncePerFight.add(rule.id);
    }
  }

  private beginNextRound(): void {
    if (this.stopping) return;

    this.round += 1;
    this.firedOncePerRound.clear();
    this.firedOncePerFight.clear();

    this.queue = [
      ...this.cfg.steps.start.pre,
      ...this.cfg.steps.start.exec,
      ...this.cfg.steps.start.post,

      ...this.cfg.steps.move.pre,
      ...this.cfg.steps.move.exec,
      ...this.cfg.steps.move.post,

      ...this.cfg.steps.identify.pre,
      ...this.cfg.steps.identify.exec,
      ...this.cfg.steps.identify.post,

      ...this.cfg.steps.fight.pre,
      ...this.cfg.steps.fight.exec,

      ...this.cfg.steps.reset.endRound,
      ...this.cfg.steps.reset.wait,
    ];

    this.actionIndex = 0;
    this.setState({ status: 'running', round: this.round, step: 'round', actionIndex: 0 });
    this.stepNext();
  }

  private stepNext(): void {
    if (this.stopping) return;
    this.clearTimer();

    if (this.waiter.kind !== 'none') return;

    if (Date.now() - this.lastTerminalAt > (this.cfg.idleTimeoutMs || 30_000)) {
      this.setState({ status: 'error', message: 'Idle timeout waiting for terminal output.' });
      return;
    }

    if (this.actionIndex >= this.queue.length) {
      if (this.cfg.loopRounds) this.beginNextRound();
      else this.setState({ status: 'idle' });
      return;
    }

    const idx = this.actionIndex;
    const action = this.queue[idx];

    this.setState({ status: 'running', round: this.round, step: 'round', actionIndex: idx });
    this.actionIndex += 1;

    switch (action.kind) {
      case 'send': {
        this.send(action.cmd);
        this.stepNext();
        return;
      }

      case 'wait_ms': {
        const ms = Math.max(0, action.ms);
        this.pendingTimer = window.setTimeout(() => {
          this.pendingTimer = null;
          this.stepNext();
        }, ms);
        return;
      }

      case 'wait_text': {
        const timeout = Math.max(250, action.timeoutMs ?? 8000);
        this.waiter = {
          kind: 'text',
          text: action.text,
          caseInsensitive: action.caseInsensitive !== false,
          deadline: Date.now() + timeout,
        };
        this.armWaitTimeout(timeout);
        return;
      }

      case 'wait_regex': {
        const timeout = Math.max(250, action.timeoutMs ?? 8000);
        const flags = action.flags ?? 'i';
        this.waiter = { kind: 'regex', re: new RegExp(action.pattern, flags), deadline: Date.now() + timeout };
        this.armWaitTimeout(timeout);
        return;
      }

      default: {
        this.setState({ status: 'error', message: `Unknown action kind: ${(action as any)?.kind}` });
        return;
      }
    }
  }

  private armWaitTimeout(timeoutMs: number): void {
    this.clearTimer();
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      if (this.waiter.kind === 'none') return;
      this.waiter = { kind: 'none' };
      this.setState({ status: 'error', message: 'Timed out waiting for expected output.' });
    }, timeoutMs);
  }

  private clearTimer(): void {
    if (this.pendingTimer != null) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  private setState(s: AutoLevelRunState): void {
    this.state = s;
    this.onState(s);
  }
}
