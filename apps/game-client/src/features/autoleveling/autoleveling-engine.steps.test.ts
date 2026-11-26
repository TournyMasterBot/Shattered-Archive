// apps/game-client/src/features/autoleveling/autoleveling-engine.steps.test.ts
//
// Live findings of 2026-11-19..25 (game-server logs): a route step the game takes seconds to finish (heel, ride) was followed at once by the
// next move; the player's own casts were walked over; and a plain `cast 'shield'` row was cast after every fight while the shield was up
// (61 recasts). The engine talks to the real window event bus (jsdom); timers are fake.

import { AutoLevelingEngine } from './autoleveling-engine';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import type { AutoLevelAction, AutoLevelConfig } from './autoleveling-types';

const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const rawText = (text: string) => emit('shatteredarchive:raw-data', { text, rawText: text, fromUserScript: false });
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

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

function routeConfig(trainingPath: string, startPre: AutoLevelAction[] = []): AutoLevelConfig {
  const base = createDefaultAutoLevelConfig();
  return {
    ...base,
    mode: 'auto_level',
    loopRounds: false,
    moveSettleMs: 0,
    lookSettleMs: 0,
    postFightSettleMs: 0,
    init: { ...base.init, trainingPath, targets: [] },
    steps: { ...base.steps, start: { pre: startPre, exec: [], post: [] } },
  };
}

function makeEngine(cfg: AutoLevelConfig) {
  const runStates: any[] = [];
  const engine = new AutoLevelingEngine({ getConfig: () => cfg, setRunState: (s) => runStates.push(s) }) as any;
  engine.bind();
  return { engine, runStates };
}

const moved = () => emit('shatteredarchive:movement-succeeded', { cmd: 'n', room: { room: 'Some Room', sector: 'inside', exits: [] } });
const wire = (text: string) => emit('shatteredarchive:command-sent', { text });

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('a slow route step is waited for, not a fixed half second', () => {
  it('heel waits for the steed to arrive, ride waits for the mount, and only then does the move go out', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(routeConfig('heel;ride st;n'));
    const done = engine.start();

    await advance(10);
    expect(sent).toEqual(['heel']);
    await advance(8000); // the steed is still running to us
    expect(sent).toEqual(['heel']);

    rawText('You let out a loud whistle.\r\n'); // the echo of the whistle is not the arrival
    await advance(1000);
    expect(sent).toEqual(['heel']);

    rawText('An unholy steed comes running in.\r\n');
    await advance(10);
    expect(sent).toEqual(['heel', 'ride st']);
    await advance(5000); // the mount takes a few seconds too
    expect(sent).toEqual(['heel', 'ride st']);

    rawText('You mount an unholy steed.\r\n');
    await advance(10);
    expect(sent).toEqual(['heel', 'ride st', 'n']);
    moved();
    await done;
    off();
  });

  it('a ride that fails pauses the run for the player instead of walking on unmounted', async () => {
    const { sent, off } = captureSends();
    const term = captureTerminal();
    const { engine, runStates } = makeEngine(routeConfig('ride st;n'));
    const done = engine.start();
    await advance(10);
    expect(sent).toEqual(['ride st']);

    rawText("They're not here.\r\n");
    await advance(1000);
    expect(sent).toEqual(['ride st']); // no n
    const paused = runStates.filter((s) => s.status === 'paused').at(-1);
    expect(paused).toMatchObject({ reason: 'timeout', message: '"ride st" did not work' });
    expect(term.writes.some((w) => w.includes('"ride st" did not work'))).toBe(true);

    engine.resume();
    await advance(3000);
    expect(sent).toContain('n'); // the player fixed it and resumed: the route goes on
    moved();
    await done;
    off();
    term.off();
  });

  it('a ride the game never answers also pauses, after its own timeout', async () => {
    const { sent, off } = captureSends();
    const { engine, runStates } = makeEngine(routeConfig('ride st;n'));
    const done = engine.start();
    await advance(19_000);
    expect(runStates.some((s) => s.status === 'paused')).toBe(false);
    await advance(2000);
    expect(runStates.filter((s) => s.status === 'paused').at(-1)?.message).toBe('no answer to "ride st" after 20s');
    expect(sent).toEqual(['ride st']);
    engine.stop();
    await advance(2000);
    await done;
    off();
  });

  it('a heel nobody answers is noted and the route goes on (the ride after it has its own check)', async () => {
    const { sent, off } = captureSends();
    const term = captureTerminal();
    const { engine, runStates } = makeEngine(routeConfig('heel;ride st'));
    const done = engine.start();
    await advance(20_100);
    expect(sent).toEqual(['heel', 'ride st']);
    expect(runStates.some((s) => s.status === 'paused')).toBe(false);
    expect(term.writes.some((w) => w.includes('no answer to "heel" after 20s; carrying on'))).toBe(true);
    rawText('You mount an unholy steed.\r\n');
    await advance(10);
    await done;
    off();
    term.off();
  });

  it('a heel that fails ("still fighting") is noted and the route goes on', async () => {
    const { sent, off } = captureSends();
    const term = captureTerminal();
    const { engine } = makeEngine(routeConfig('heel;ride st'));
    const done = engine.start();
    await advance(10);
    rawText('No way!  You are still fighting!\r\n');
    await advance(10);
    expect(sent).toEqual(['heel', 'ride st']);
    expect(term.writes.some((w) => w.includes('"heel" did not work; carrying on'))).toBe(true);
    rawText("You can't ride that.\r\n");
    await advance(10);
    engine.stop();
    await advance(2000);
    await done;
    off();
    term.off();
  });

  it('after the answer the configured settle still applies (500 ms), so the next move is not sent in the same instant', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine({ ...routeConfig('heel;n'), lookSettleMs: 500 });
    const done = engine.start();
    await advance(10);
    rawText('An unholy steed gallops in.\r\n');
    await advance(400);
    expect(sent).toEqual(['heel']);
    await advance(200);
    expect(sent).toEqual(['heel', 'n']);
    moved();
    await done;
    off();
  });

  it('text that arrives while no step is waited for changes nothing', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(routeConfig('n'));
    rawText("They're not here.\r\nYou mount an unholy steed.\r\n");
    const done = engine.start();
    await advance(10);
    moved();
    await done;
    off();
    expect(sent).toEqual(['n']);
  });

  it('Stop ends a wait for a step answer at once', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(routeConfig('heel;n'));
    const done = engine.start();
    await advance(10);
    engine.stop();
    await advance(10);
    await done;
    expect(sent).toEqual(['heel']);
    off();
  });
});

describe("the player's own slow commands are not walked over", () => {
  function runningEngine() {
    const { engine } = makeEngine(routeConfig('n'));
    engine.cfg = routeConfig('n');
    engine.running = true;
    return engine;
  }

  it('a cast typed by hand holds the next step for the lag of a cast, once, with one notice', async () => {
    const term = captureTerminal();
    const engine = runningEngine();
    wire('c haste');
    let released = false;
    const held = engine.yieldToManual().then(() => (released = true));
    await advance(3900);
    expect(released).toBe(false);
    await advance(200);
    await held;
    expect(released).toBe(true);
    expect(engine.manualBusy).toBeNull();
    expect(term.writes.filter((w) => w.includes('waiting for your spell to finish'))).toHaveLength(1);

    await engine.yieldToManual(); // nothing pending: returns at once
    term.off();
  });

  it("the engine's own casts and sends are not mistaken for the player", async () => {
    const { off } = captureSends();
    const engine = runningEngine();
    await engine.sendCommand("cast 'bless'");
    wire("cast 'bless'"); // what the wire signal says for the engine's own send
    expect(engine.manualBusy).toBeNull();
    wire("cast 'bless'"); // a second one is the player's (the first was used up)
    expect(engine.manualBusy).not.toBeNull();
    off();
  });

  it('a send through the command processor (an alias may rewrite it) is never taken for the player', () => {
    const { engine } = makeEngine(routeConfig('n'));
    engine.running = true;
    engine.deps.sendThroughCommandProcessor = jest.fn();
    return engine.sendViaCommandProcessor('wake;stand').then(() => {
      wire('c haste'); // the alias expanded into something that looks like a cast
      expect(engine.manualBusy).toBeNull();
    });
  });

  it('look, who, a chat line or a kill never hold the engine', () => {
    const engine = runningEngine();
    for (const t of ['l', 'whoc', 'imp', 'kill fur', 'n', '']) wire(t);
    expect(engine.manualBusy).toBeNull();
  });

  it('a heel typed by hand holds until the steed arrives', async () => {
    const engine = runningEngine();
    wire('heel');
    let released = false;
    const held = engine.yieldToManual().then(() => (released = true));
    await advance(6000);
    expect(released).toBe(false);
    rawText('An unholy steed gallops in.\r\n');
    await advance(300);
    await held;
    expect(released).toBe(true);
  });

  it('is capped, so a command the game never answers cannot hold the run for ever', async () => {
    const engine = runningEngine();
    wire('ride st');
    let released = false;
    const held = engine.yieldToManual().then(() => (released = true));
    await advance(20_100);
    await held;
    expect(released).toBe(true);
    expect(engine.manualBusy).toBeNull();
  });

  it('a hold that ran out while the engine was busy elsewhere is dropped without waiting', async () => {
    const term = captureTerminal();
    const engine = runningEngine();
    wire('c haste');
    await advance(5000); // the engine was in a fight; the cast is long over
    await engine.yieldToManual();
    expect(engine.manualBusy).toBeNull();
    expect(term.writes.some((w) => w.includes('waiting for your'))).toBe(false);
    term.off();
  });

  it('remembers no more than the last hundred sends of its own', async () => {
    const { off } = captureSends();
    const engine = runningEngine();
    for (let i = 0; i < 130; i++) await engine.sendCommand(`emote ${i}`);
    expect(engine.ownSends).toHaveLength(100);
    expect(engine.ownSends.at(-1).text).toBe('emote 129');
    off();
  });

  it('does nothing while no run is going, and after Stop', () => {
    const { engine } = makeEngine(routeConfig('n'));
    wire('c haste');
    expect(engine.manualBusy).toBeNull();
    engine.running = true;
    engine.stopping = true;
    wire('c haste');
    expect(engine.manualBusy).toBeNull();
  });

  it('a buff held for the player\'s cast sees the affect it adds and does not cast again', async () => {
    const { sent, off } = captureSends();
    const cfg = routeConfig('n', [{ kind: 'if_affect_missing', affectName: 'haste', cmd: "cast 'haste'" }]);
    const { engine } = makeEngine(cfg);
    engine.cfg = cfg;
    engine.running = true;
    wire('c haste'); // the player casts haste by hand just before the buff check
    const check = engine.runActions(cfg.steps.start.pre, 'start.pre', 1);
    await advance(1500);
    emit('game:affect-added', { n: 'haste' }); // the game answers the player's cast
    await advance(4000);
    await check;
    off();
    expect(sent).toEqual([]);
  });
});

describe('a buff that is already up is not cast again after every fight', () => {
  const SHIELD: AutoLevelAction = { kind: 'send', cmd: "cast 'shield'", combatState: 'out' };

  function engineWith(pre: AutoLevelAction[]) {
    const cfg = routeConfig('n', pre);
    const { engine } = makeEngine(cfg);
    engine.cfg = cfg;
    engine.running = true;
    return engine;
  }

  it('skips a plain cast of a known buff while its affect shows, says so once, and casts it when the affect is gone', async () => {
    const { sent, off } = captureSends();
    const term = captureTerminal();
    const engine = engineWith([SHIELD]);

    emit('game:affect-added', { n: 'shield' });
    await engine.recheckBuffs(1, 'postFight.buffs');
    await engine.recheckBuffs(2, 'postFight.buffs');
    expect(sent).toEqual([]);
    expect(term.writes.filter((w) => w.includes('Shield is still up'))).toHaveLength(1);

    emit('game:affect-removed', { n: 'shield' });
    const again = engine.recheckBuffs(3, 'postFight.buffs');
    await advance(1000);
    await again;
    expect(sent).toEqual(["cast 'shield'"]);
    off();
    term.off();
  });

  it('leaves a tick-gated row alone: its job is to refresh before the affect runs out', async () => {
    const { sent, off } = captureSends();
    const engine = engineWith([{ kind: 'send_every_ticks', cmd: "cast 'shield'", everyTicks: 0 }]);
    emit('game:affect-added', { n: 'shield' });
    await engine.recheckBuffs(1, 'postFight.buffs');
    off();
    expect(sent).toEqual(["cast 'shield'"]);
  });

  it('still asks again about a condition row whose buff is not up, and about no ungated row at all', async () => {
    const { sent, off } = captureSends();
    const engine = engineWith([
      { kind: 'send', cmd: "cast 'haste'", vitalsGate: { stat: 'mp', op: 'above', pct: 0 } },
      { kind: 'send', cmd: 'say hello' },
    ]);
    const check = engine.recheckBuffs(1, 'postFight.buffs');
    await advance(1000);
    await check;
    off();
    expect(sent).toEqual(["cast 'haste'"]); // the ungated send waits for the top of the round, as before
  });

  it('does not touch a heal (no affect to look for) or a command that is not a known buff', () => {
    const engine = engineWith([]);
    emit('game:affect-added', { n: 'shield' });
    expect(engine.isRedundantBuffRecast({ kind: 'send', cmd: "cast 'dark heal'", combatState: 'out' })).toBe(false);
    expect(engine.isRedundantBuffRecast({ kind: 'send', cmd: 'quaff green', combatState: 'out' })).toBe(false);
    expect(engine.isRedundantBuffRecast({ kind: 'send_every_ticks', cmd: "cast 'shield'", everyTicks: 1 })).toBe(false);
    expect(engine.isRedundantBuffRecast({ kind: 'send', cmd: "cast 'shield'", combatState: 'out' })).toBe(true);
  });
});
