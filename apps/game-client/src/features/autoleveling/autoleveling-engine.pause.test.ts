// apps/game-client/src/features/autoleveling/autoleveling-engine.pause.test.ts
//
// A timeout pauses the run instead of ending it, and the movement backstop no longer undercuts the movement tracker (live findings
// 2026-11-14, items 1 and 3; RUNLOOP-01). Timers are fake: the backstop is about five seconds.

import { AutoLevelingEngine } from './autoleveling-engine';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import type { AutoLevelAction, AutoLevelConfig } from './autoleveling-types';
import { HEAD_TIMEOUT_MS, movementTracker } from '../movement/movementTracker';

const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
const mark = (cmd: string): AutoLevelAction => ({ kind: 'send', cmd });

function captureSends() {
  const sent: string[] = [];
  const listener = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { cmd?: unknown };
    if (d && typeof d.cmd === 'string') sent.push(d.cmd);
  };
  window.addEventListener('shatteredarchive:send-command', listener);
  return { sent, off: () => window.removeEventListener('shatteredarchive:send-command', listener) };
}

function captureTerminal() {
  const writes: string[] = [];
  const listener = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { rawText?: unknown };
    if (d && typeof d.rawText === 'string') writes.push(d.rawText);
  };
  window.addEventListener('shatteredarchive:write-terminal', listener);
  return { writes, off: () => window.removeEventListener('shatteredarchive:write-terminal', listener) };
}

/** A one-step route with the default idle timeout (1000 ms, the value the wizard runs with): the config of the 2026-11-14 stops. */
function routeConfig(over: Partial<AutoLevelConfig> = {}): AutoLevelConfig {
  const base = createDefaultAutoLevelConfig();
  return {
    ...base,
    mode: 'auto_level',
    loopRounds: false,
    moveSettleMs: 0,
    lookSettleMs: 0,
    postFightSettleMs: 0,
    init: { ...base.init, trainingPath: 'n', targets: [] },
    steps: {
      ...base.steps,
      move: { pre: [], exec: [], post: [mark('MARK_MOVEPOST')] },
      reset: { endRound: [mark('MARK_RESET')], wait: [] },
    },
    ...over,
  };
}

function makeEngine(cfg: AutoLevelConfig) {
  const runStates: any[] = [];
  const engine = new AutoLevelingEngine({ getConfig: () => cfg, setRunState: (s) => runStates.push(s) }) as any;
  engine.bind();
  return { engine, runStates };
}

const moved = () => emit('shatteredarchive:movement-succeeded', { cmd: 'n', room: { room: 'Some Room', sector: 'inside', exits: [] } });

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('the movement backstop no longer undercuts the tracker (L19)', () => {
  it('the default idle timeout (1000 ms) is shorter than the tracker\'s own timeout: the backstop is longer than both', async () => {
    expect(createDefaultAutoLevelConfig().idleTimeoutMs).toBe(1000);
    expect(HEAD_TIMEOUT_MS).toBe(1200);
    const { sent, off } = captureSends();
    const { engine, runStates } = makeEngine(routeConfig());
    const done = engine.start();
    await advance(10);
    expect(sent).toContain('n');

    await advance(2500); // well past the old 1000 ms backstop
    expect(runStates.some((s) => s.status === 'paused' || s.status === 'error')).toBe(false);
    moved();
    await done;
    off();
    expect(sent.filter((c) => c.startsWith('MARK_'))).toEqual(['MARK_MOVEPOST', 'MARK_RESET']);
  });

  it('a reply held up by casts the engine queued just before it is still waited for', async () => {
    const { sent, off } = captureSends();
    const { engine, runStates } = makeEngine(routeConfig());
    const now = Date.now();
    engine.recentSends = [0, 1, 2].map((i) => ({ at: now - 100 + i, lagMs: 1500 }));
    const done = engine.start();
    await advance(10);

    await advance(8000); // 4800 plus about 4500 of queued lag would be ~9300
    expect(runStates.some((s) => s.status === 'paused' || s.status === 'error')).toBe(false);
    moved();
    await done;
    off();
    expect(sent).toContain('MARK_RESET');
  });
});

describe('no reply at all pauses the run (L20, L21, L22)', () => {
  it('pauses with the reason shown, is not an error, and resume carries on to the end of the round', async () => {
    const { sent, off } = captureSends();
    const term = captureTerminal();
    const { engine, runStates } = makeEngine(routeConfig());
    const done = engine.start();
    await advance(6000); // past the backstop, no reply

    const paused = runStates.filter((s) => s.status === 'paused');
    expect(paused).toHaveLength(1);
    expect(paused[0]).toMatchObject({ status: 'paused', reason: 'timeout', message: 'no reply to "n"' });
    expect(runStates.some((s) => s.status === 'error')).toBe(false);
    expect(term.writes.filter((w) => w.includes('paused: no reply to "n"'))).toHaveLength(1);
    expect(sent.filter((c) => c.startsWith('MARK_'))).toEqual([]); // not past the move yet

    engine.resume();
    await advance(1000);
    await done;
    off();
    term.off();
    expect(sent.filter((c) => c.startsWith('MARK_'))).toEqual(['MARK_MOVEPOST', 'MARK_RESET']);
    expect(sent.filter((c) => c === 'look').length).toBeGreaterThanOrEqual(1); // resume re-scans the room first
    expect(runStates.some((s) => s.status === 'error')).toBe(false);
  });

  it('Stop while paused by a timeout ends the run', async () => {
    const { off } = captureSends();
    const { engine, runStates } = makeEngine(routeConfig());
    const done = engine.start();
    await advance(6000);
    expect(runStates.some((s) => s.status === 'paused')).toBe(true);
    engine.stop();
    await advance(1000);
    await done;
    off();
    expect(runStates.at(-1)).toEqual({ status: 'idle' });
  });

  it('a player who is already paused gets no second pause and no second line (L22)', async () => {
    const term = captureTerminal();
    const { engine, runStates } = makeEngine(routeConfig());
    engine.start();
    await advance(10);
    engine.pause();
    const pausedBefore = runStates.filter((s) => s.status === 'paused').length;
    engine.pauseForTimeout('something');
    term.off();
    expect(runStates.filter((s) => s.status === 'paused')).toHaveLength(pausedBefore);
    expect(term.writes.filter((w) => w.includes('paused: something'))).toEqual([]);
    engine.stop();
  });

  it('a user pause and a flee pause carry their own reason', () => {
    const { engine, runStates } = makeEngine(routeConfig());
    engine.pause();
    engine.resume();
    engine.pause('flee');
    expect(runStates.filter((s) => s.status === 'paused').map((s) => s.reason)).toEqual(['user', 'flee']);
  });

  it('nothing pauses a run that is stopping', () => {
    const { engine, runStates } = makeEngine(routeConfig());
    engine.stop();
    engine.pauseForTimeout('late');
    expect(runStates.some((s) => s.status === 'paused')).toBe(false);
  });
});

describe('a wait action that times out pauses the run and is skipped on resume (L21)', () => {
  it('wait_text', async () => {
    const { sent, off } = captureSends();
    const cfg = routeConfig();
    const { engine, runStates } = makeEngine(cfg);
    engine.cfg = cfg;
    const done = engine.runActions([{ kind: 'wait_text', text: 'never appears', timeoutMs: 500 }, mark('AFTER')], 'move.pre', 1);
    await advance(600);
    expect(runStates.find((s) => s.status === 'paused')).toMatchObject({ reason: 'timeout', message: 'waiting for text timed out: never appears' });
    expect(sent).not.toContain('AFTER');
    engine.resume();
    await advance(500);
    await done;
    off();
    expect(sent).toContain('AFTER');
  });

  it('wait_regex and wait_fighting use the same pause', async () => {
    const cfg = routeConfig();
    const { engine, runStates } = makeEngine(cfg);
    engine.cfg = cfg;
    const a = engine.runActions([{ kind: 'wait_regex', pattern: 'zzz', timeoutMs: 100 }], 'move.pre', 1);
    await advance(200);
    expect(runStates.filter((s) => s.status === 'paused')).toHaveLength(1);
    expect(runStates.find((s) => s.status === 'paused').message).toMatch(/^waiting for regex timed out/);
    engine.resume();
    await advance(500);
    await a;

    const b = engine.runActions([{ kind: 'wait_fighting', value: true, timeoutMs: 100 }], 'move.pre', 1);
    await advance(200);
    expect(runStates.filter((s) => s.status === 'paused')).toHaveLength(2);
    expect(runStates.filter((s) => s.status === 'paused')[1].message).toMatch(/^waiting for fighting timed out/);
    engine.resume();
    await advance(500);
    await b;
  });

  it('Stop during a wait still ends it as before, with no pause', async () => {
    const cfg = routeConfig();
    const { engine, runStates } = makeEngine(cfg);
    engine.cfg = cfg;
    const done = engine.runActions([{ kind: 'wait_text', text: 'never', timeoutMs: 60_000 }], 'move.pre', 1);
    await advance(100);
    engine.stop();
    await expect(done).rejects.toThrow('stopped');
    expect(runStates.some((s) => s.status === 'paused')).toBe(false);
  });

  it('an error that is not a wait timeout is still fatal', async () => {
    const cfg = routeConfig();
    const { engine, runStates } = makeEngine(cfg);
    engine.cfg = cfg;
    jest.spyOn(engine, 'execAction').mockRejectedValueOnce(new Error('boom'));
    await expect(engine.runActions([mark('x')], 'move.pre', 1)).rejects.toThrow('boom');
    expect(runStates.some((s) => s.status === 'paused')).toBe(false);
  });
});

describe('a fight that never ends pauses the run, and resume waits for it again (L21)', () => {
  const target = { cleanName: 'a bear', name: 'a bear', lookName: 'A bear stands here.', keywords: ['bear'] };

  it('pauses after the backstop; resume waits again while the fight is still on, then finishes when it ends', async () => {
    jest.spyOn(movementTracker, 'pendingCount').mockReturnValue(0); // earlier tests leave unanswered moves in the shared tracker
    const { sent, off } = captureSends();
    const base = routeConfig();
    const cfg = { ...base, steps: { ...base.steps, fight: { pre: [], exec: [], post: [mark('MARK_FIGHT_POST')] } } };
    const { engine, runStates } = makeEngine(cfg);
    engine.cfg = cfg;
    engine.injectedQueue = [{ kind: '__engage_target', target }];
    const done = engine.flushInjected(1);
    await advance(10);
    expect(sent).toContain('kill bear');
    emit('game:char-data', { is_fighting: true });
    await advance(10);

    await advance(10 * 60_000 + 1000); // the 10-minute backstop
    expect(runStates.find((s) => s.status === 'paused')).toMatchObject({ reason: 'timeout', message: 'the fight did not end' });
    expect(runStates.some((s) => s.status === 'error')).toBe(false);
    expect(sent).not.toContain('MARK_FIGHT_POST');

    engine.resume();
    await advance(2000);
    expect(sent).not.toContain('MARK_FIGHT_POST'); // still fighting: it keeps waiting, it does not walk away

    emit('game:char-data', { is_fighting: false });
    await advance(30_000); // the post-fight room re-scan waits for a reply (20 s at most) before the round goes on
    await done;
    off();
    expect(sent).toContain('MARK_FIGHT_POST');
  });
});
