// apps/game-client/src/features/autoleveling/autoleveling-engine.disconnect.test.ts
//
// A dropped connection stops the run: it says so, sends nothing more, and does not start again by itself.

import { AutoLevelingEngine } from './autoleveling-engine';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import type { AutoLevelConfig } from './autoleveling-types';

const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

function capture(name: string, field: string) {
  const values: string[] = [];
  const listener = (ev: Event) => {
    const value = ((ev as CustomEvent).detail as Record<string, unknown>)?.[field];
    if (typeof value === 'string') values.push(value);
  };
  window.addEventListener(name, listener);
  return { values, off: () => window.removeEventListener(name, listener) };
}

function routeConfig(): AutoLevelConfig {
  const base = createDefaultAutoLevelConfig();
  return {
    ...base,
    mode: 'auto_level',
    loopRounds: true,
    moveSettleMs: 0,
    lookSettleMs: 0,
    postFightSettleMs: 0,
    roundLoopTimeMs: 60_000,
    init: { ...base.init, trainingPath: 'n', targets: [] },
    steps: { ...base.steps, move: { pre: [], exec: [], post: [] }, reset: { endRound: [], wait: [] } },
  };
}

let sends: ReturnType<typeof capture>;
let writes: ReturnType<typeof capture>;
let runStates: Array<{ status: string }>;
let engine: AutoLevelingEngine;

const lost = () => writes.values.filter((w) => w.includes('connection lost'));
const close = () => emit('game:remote-server:close', {});
const moved = () => emit('shatteredarchive:movement-succeeded', { cmd: 'n', room: { room: 'Some Room', sector: 'inside', exits: [] } });

beforeEach(() => {
  jest.useFakeTimers();
  sends = capture('shatteredarchive:send-command', 'cmd');
  writes = capture('shatteredarchive:write-terminal', 'rawText');
  runStates = [];
  const cfg = routeConfig();
  engine = new AutoLevelingEngine({ getConfig: () => cfg, setRunState: (s) => runStates.push(s) });
  engine.bind();
});

afterEach(async () => {
  engine.stop();
  await advance(120_000);
  sends.off();
  writes.off();
  jest.useRealTimers();
});

/** start() launches the run loop and returns; the loop is followed through the run states it reports. */
async function startRun() {
  engine.start();
  await advance(10);
  expect(sends.values).toContain('n');
}

async function expectStopped() {
  await advance(10);
  const sentAtDrop = sends.values.length;
  await advance(300_000);

  expect(sends.values).toHaveLength(sentAtDrop);
  expect(lost()).toHaveLength(1);
  expect(runStates.at(-1)?.status).toBe('idle');
}

it('stops a run that is waiting for the game, and nothing more is sent', async () => {
  await startRun();
  close();
  await expectStopped();
});

it('stops a paused run, which is not resumed by itself', async () => {
  await startRun();
  engine.pause();
  close();
  await expectStopped();
  expect(runStates.at(-1)?.status).toBe('idle');
});

it('stops a run in the middle of the long wait between laps', async () => {
  await startRun();
  moved();
  await advance(5_000); // the lap is over: the engine waits for the creatures to return
  close();
  await expectStopped();
});

it('says nothing when no run is going, also on the second close of one drop', async () => {
  close();
  expect(lost()).toHaveLength(0);

  await startRun();
  close();
  close();
  await expectStopped();
});
