// apps/game-client/src/features/autoleveling/autoleveling-engine.lapwait.test.ts
//
// The wait between laps (live findings 2026-11-14, item 10; RUNLOOP-02): it waits the configured time, Stop ends it within a second,
// and a pause freezes what is left of it. Timers are fake, so three minutes cost nothing.

import { AutoLevelingEngine } from './autoleveling-engine';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import type { AutoLevelAction, AutoLevelConfig } from './autoleveling-types';

const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
const mark = (cmd: string): AutoLevelAction => ({ kind: 'send', cmd });
const moved = () => emit('shatteredarchive:movement-succeeded', { cmd: 'n', room: { room: 'Some Room', sector: 'inside', exits: [] } });

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

function loopConfig(lapMs: number): AutoLevelConfig {
  const base = createDefaultAutoLevelConfig();
  return {
    ...base,
    mode: 'auto_level',
    loopRounds: true,
    roundLoopTimeMs: lapMs,
    moveSettleMs: 0,
    lookSettleMs: 0,
    postFightSettleMs: 0,
    init: { ...base.init, trainingPath: 'n', targets: [] },
    steps: { ...base.steps, reset: { endRound: [mark('MARK_RESET')], wait: [] } },
  };
}

/** Starts a one-step route and finishes lap 1; returns once the engine is in the wait. */
async function intoTheWait(lapMs: number) {
  const cfg = loopConfig(lapMs);
  const runStates: any[] = [];
  const engine = new AutoLevelingEngine({ getConfig: () => cfg, setRunState: (s) => runStates.push(s) }) as any;
  engine.bind();
  const sends = captureSends();
  const term = captureTerminal();
  const done = engine.start();
  await advance(10);
  moved();
  await advance(100);
  expect(sends.sent).toContain('MARK_RESET'); // lap 1 is over
  return { engine, done, sends, term, runStates, laps: () => sends.sent.filter((c) => c === 'n').length };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('the wait between laps', () => {
  jest.setTimeout(30_000);

  it('waits the whole configured time, and starts the next lap right after it', async () => {
    const t = await intoTheWait(180_000);
    expect(t.runStates.at(-1)).toEqual({ status: 'waiting' });
    expect(t.laps()).toBe(1);

    await advance(179_000);
    expect(t.laps()).toBe(1); // 3 minutes, not 3 seconds

    await advance(1500);
    expect(t.laps()).toBe(2);
    t.engine.stop();
    await advance(1000);
    await t.done;
    t.sends.off();
    t.term.off();
  });

  it('says how long it will wait, once', async () => {
    const t = await intoTheWait(180_000);
    expect(t.term.writes.filter((w) => w.includes('waiting 3:00 before the next lap'))).toHaveLength(1);
    t.engine.stop();
    await advance(1000);
    await t.done;
    t.sends.off();
    t.term.off();
  });

  it('a short wait (a few seconds) is silent', async () => {
    const t = await intoTheWait(2000);
    expect(t.term.writes.filter((w) => w.includes('before the next lap'))).toEqual([]);
    t.engine.stop();
    await advance(1000);
    await t.done;
    t.sends.off();
    t.term.off();
  });

  it('Stop ends it within a second, not after the minutes (L24)', async () => {
    const t = await intoTheWait(180_000);
    await advance(10_000);
    t.engine.stop();
    await advance(1000);
    await t.done; // would hang for 170 more seconds of fake time if the wait could not be interrupted
    expect(t.runStates.at(-1)).toEqual({ status: 'idle' });
    await advance(200_000);
    expect(t.laps()).toBe(1);
    t.sends.off();
    t.term.off();
  });

  it('a pause freezes what is left of it, and Resume carries on with the rest (L25)', async () => {
    const t = await intoTheWait(180_000);
    await advance(60_000);
    t.engine.pause();
    await advance(300_000); // five minutes paused: not counted
    expect(t.laps()).toBe(1);

    t.engine.resume();
    await advance(118_000);
    expect(t.laps()).toBe(1); // about 120 s were left
    await advance(4000);
    expect(t.laps()).toBe(2);
    t.engine.stop();
    await advance(1000);
    await t.done;
    t.sends.off();
    t.term.off();
  });

  it('configured reset.wait actions still replace the plain wait', async () => {
    const base = loopConfig(180_000);
    const cfg = { ...base, steps: { ...base.steps, reset: { endRound: [mark('MARK_RESET')], wait: [mark('MARK_WAIT')] } } };
    const engine = new AutoLevelingEngine({ getConfig: () => cfg, setRunState: () => undefined }) as any;
    engine.bind();
    const sends = captureSends();
    const done = engine.start();
    await advance(10);
    moved();
    await advance(1000);
    expect(sends.sent).toContain('MARK_WAIT');
    engine.stop();
    await advance(1000);
    await done;
    sends.off();
  });
});
