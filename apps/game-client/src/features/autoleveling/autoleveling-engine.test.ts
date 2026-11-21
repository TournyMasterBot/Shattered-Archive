// apps/game-client/src/features/autoleveling/autoleveling-engine.test.ts

/**
 * Engine shore-up coverage (plan step 9):
 *  - round order: start → move.pre → move → move.post → reset
 *  - if_affect_missing suppresses a buff whose GMCP affect is live
 *  - send_cooldown fires once, then again only after the cooldown
 *  - send_every_ticks re-fires only after N game:tick events
 *  - a criticalBuff dropping mid-fight: inCombatCmd fires; one without is deferred
 *    to the post-combat top-up
 *  - a holdNearLevel buff is not re-cast while tnl <= the kill-XP estimate
 *  - alignmentXpModifier: 2× opposite / 0.5× same / 1× any-neutral
 *
 * The engine talks to the real window event bus (jsdom), so tests drive it with
 * CustomEvents and read commands off `shatteredarchive:send-command`.
 */

import { AutoLevelingEngine } from './autoleveling-engine';
import { alignmentXpModifier } from './autoleveling-alignment';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import type { AutoLevelAction, AutoLevelConfig } from './autoleveling-types';
import { movementTracker } from '../movement/movementTracker';

/* --------------------------------- helpers -------------------------------- */

const emit = (name: string, detail: unknown) =>
  window.dispatchEvent(new CustomEvent(name, { detail }));

function captureSends() {
  const sent: string[] = [];
  const listener = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { cmd?: unknown };
    if (d && typeof d.cmd === 'string') sent.push(d.cmd);
  };
  window.addEventListener('shatteredarchive:send-command', listener);
  return { sent, off: () => window.removeEventListener('shatteredarchive:send-command', listener) };
}

function captureTerminalWrites() {
  const writes: string[] = [];
  const listener = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { rawText?: unknown };
    if (d && typeof d.rawText === 'string') writes.push(d.rawText);
  };
  window.addEventListener('shatteredarchive:write-terminal', listener);
  return { writes, off: () => window.removeEventListener('shatteredarchive:write-terminal', listener) };
}

const waitFor = (pred: () => boolean, timeoutMs = 3000) =>
  new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (pred()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });

function makeConfig(overrides: Partial<AutoLevelConfig> = {}): AutoLevelConfig {
  return { ...createDefaultAutoLevelConfig(), mode: 'auto_level', ...overrides };
}

function makeEngine(cfg: AutoLevelConfig) {
  const runStates: unknown[] = [];
  const engine = new AutoLevelingEngine({
    getConfig: () => cfg,
    setRunState: (s) => runStates.push(s),
  });
  // Tests poke private state / call private methods directly — `any` on purpose.
  return { engine: engine as any, runStates };
}

/* --------------------------------- tests ---------------------------------- */

describe('alignmentXpModifier', () => {
  it('is 2× for opposite alignments', () => {
    expect(alignmentXpModifier('good', 'evil')).toBe(2);
    expect(alignmentXpModifier('evil', 'good')).toBe(2);
  });
  it('is 0.5× for the same alignment', () => {
    expect(alignmentXpModifier('good', 'good')).toBe(0.5);
    expect(alignmentXpModifier('evil', 'evil')).toBe(0.5);
  });
  it('is 1× whenever either side is neutral or unknown', () => {
    expect(alignmentXpModifier('good', 'neutral')).toBe(1);
    expect(alignmentXpModifier('neutral', 'evil')).toBe(1);
    expect(alignmentXpModifier(undefined, undefined)).toBe(1);
    expect(alignmentXpModifier('evil', undefined)).toBe(1);
  });
});

describe('engine round order', () => {
  it('runs start → move.pre → move → move.post → reset.endRound in order', async () => {
    const { sent, off } = captureSends();
    const mark = (cmd: string): AutoLevelAction => ({ kind: 'send', cmd });
    const cfg = makeConfig({
      loopRounds: false,
      idleTimeoutMs: 2000,
      moveSettleMs: 0,
      lookSettleMs: 0,
      postFightSettleMs: 0,
      init: { ...createDefaultAutoLevelConfig().init, trainingPath: 'n', targets: [] },
      steps: {
        ...createDefaultAutoLevelConfig().steps,
        start: { pre: [mark('MARK_START')], exec: [], post: [] },
        move: { pre: [mark('MARK_MOVEPRE')], exec: [], post: [mark('MARK_MOVEPOST')] },
        reset: { endRound: [mark('MARK_RESET')], wait: [] },
      },
    });

    const { engine } = makeEngine(cfg);
    engine.bind();
    const done = engine.start();

    await waitFor(() => sent.includes('n'));
    emit('shatteredarchive:movement-succeeded', { cmd: 'n', room: { room: 'Some Room', sector: 'inside', exits: [] } });
    await done;
    off();

    const order = sent.filter((c) => c.startsWith('MARK_') || c === 'n');
    expect(order).toEqual(['MARK_START', 'MARK_MOVEPRE', 'n', 'MARK_MOVEPOST', 'MARK_RESET']);
  }, 10000);

  it('runs rest.startOfRound before start, and rest.endOfRound after reset.endRound', async () => {
    const { sent, off } = captureSends();
    const mark = (cmd: string): AutoLevelAction => ({ kind: 'send', cmd });
    const cfg = makeConfig({
      loopRounds: false,
      idleTimeoutMs: 2000,
      moveSettleMs: 0,
      lookSettleMs: 0,
      postFightSettleMs: 0,
      init: { ...createDefaultAutoLevelConfig().init, trainingPath: 'n', targets: [] },
      steps: {
        ...createDefaultAutoLevelConfig().steps,
        start: { pre: [mark('MARK_START')], exec: [], post: [] },
        reset: { endRound: [mark('MARK_RESET')], wait: [] },
      },
      rest: {
        startOfRound: [mark('MARK_WAKE')],
        endOfRound: [mark('MARK_SLEEP')],
        duringRound: [],
      },
    });

    const { engine } = makeEngine(cfg);
    engine.bind();
    const done = engine.start();

    await waitFor(() => sent.includes('n'));
    emit('shatteredarchive:movement-succeeded', { cmd: 'n', room: { room: 'Some Room', sector: 'inside', exits: [] } });
    await done;
    off();

    const order = sent.filter((c) => c.startsWith('MARK_') || c === 'n');
    expect(order).toEqual(['MARK_WAKE', 'MARK_START', 'n', 'MARK_RESET', 'MARK_SLEEP']);
  }, 10000);
});

describe('movement gating (shared movementTracker)', () => {
  const mark = (cmd: string): AutoLevelAction => ({ kind: 'send', cmd });

  it('an explicit movement-failed is non-fatal — the round still completes through move.post/reset', async () => {
    const { sent, off } = captureSends();
    const { engine, runStates } = makeEngine(
      makeConfig({
        loopRounds: false,
        idleTimeoutMs: 2000,
        moveSettleMs: 0,
        lookSettleMs: 0,
        postFightSettleMs: 0,
        init: { ...createDefaultAutoLevelConfig().init, trainingPath: 'n', targets: [] },
        steps: {
          ...createDefaultAutoLevelConfig().steps,
          move: { pre: [], exec: [], post: [mark('MARK_MOVEPOST')] },
          reset: { endRound: [mark('MARK_RESET')], wait: [] },
        },
      }),
    );
    engine.bind();
    const done = engine.start();

    await waitFor(() => sent.includes('n'));
    emit('shatteredarchive:movement-failed', { cmd: 'n', reasonLine: 'Alas, you cannot go that way.' });
    await done;
    off();

    expect(sent.filter((c) => c.startsWith('MARK_'))).toEqual(['MARK_MOVEPOST', 'MARK_RESET']);
    expect(runStates.some((s: any) => s.status === 'error')).toBe(false);
  }, 10000);

  it('the tracker\'s own (timeout) reasonLine is ALSO non-fatal — a single stalled hop does not abort the run', async () => {
    const { sent, off } = captureSends();
    const { engine, runStates } = makeEngine(
      makeConfig({
        loopRounds: false,
        idleTimeoutMs: 2000,
        moveSettleMs: 0,
        lookSettleMs: 0,
        postFightSettleMs: 0,
        init: { ...createDefaultAutoLevelConfig().init, trainingPath: 'n', targets: [] },
        steps: {
          ...createDefaultAutoLevelConfig().steps,
          move: { pre: [], exec: [], post: [mark('MARK_MOVEPOST')] },
          reset: { endRound: [mark('MARK_RESET')], wait: [] },
        },
      }),
    );
    engine.bind();
    const done = engine.start();

    await waitFor(() => sent.includes('n'));
    emit('shatteredarchive:movement-failed', { cmd: 'n', reasonLine: '(timeout)' });
    await done;
    off();

    expect(sent.filter((c) => c.startsWith('MARK_'))).toEqual(['MARK_MOVEPOST', 'MARK_RESET']);
    expect(runStates.some((s: any) => s.status === 'error')).toBe(false);
  }, 10000);

  // The backstop used to end the run (this test asserted status 'error'); since 2026-11-18 it pauses it, with a longer timer.
  // See autoleveling-engine.pause.test.ts.
});

describe('waitForEngageOutcome (queue-depth-aware timeout, movement-tracking-fix Step 5)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('regression: fires at attemptTimeout unchanged when the movement queue is empty throughout', async () => {
    jest.useFakeTimers();
    jest.spyOn(movementTracker, 'pendingCount').mockReturnValue(0);
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    const p = engine.waitForEngageOutcome(3000, 800);
    jest.advanceTimersByTime(3000);
    const r = await p;
    expect(r).toEqual({ ok: false, reason: 'timeout' });
  });

  it('defers the timeout while the queue is backed up, firing only once it drains, using the remaining window', async () => {
    jest.useFakeTimers();
    const pendingSpy = jest.spyOn(movementTracker, 'pendingCount').mockReturnValue(2);
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    const p = engine.waitForEngageOutcome(3000, 800);

    jest.advanceTimersByTime(3000); // the original deadline — still backed up, must not resolve
    jest.advanceTimersByTime(2000); // kept polling every 250ms while backed up
    let resolved = false;
    p.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    pendingSpy.mockReturnValue(0); // the movement queue drains
    jest.advanceTimersByTime(3000); // the full attempt window, measured from the drain point
    const r = await p;
    expect(r).toEqual({ ok: false, reason: 'timeout' });
  });

  it('a success/not_here signal still resolves immediately even while the movement queue is backed up', async () => {
    jest.useFakeTimers();
    jest.spyOn(movementTracker, 'pendingCount').mockReturnValue(5);
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    const p = engine.waitForEngageOutcome(3000, 800);
    emit('game:char-data', { is_fighting: true });

    const r = await p;
    expect(r.ok).toBe(true);
  });
});

describe('room scan waits for the look reply (live-log fix 2026-11-13)', () => {
  const roomBlock = (mobLine: string) =>
    `A Knot On the Trunk\r\n [Exits: northwest northeast  ]\r\n${mobLine}\r\n<700/704hp 600/674m 250/250mv 1tnl>\r\n`;
  const rawData = (text: string) => emit('shatteredarchive:raw-data', { text, rawText: text, fromUserScript: false });

  afterEach(() => jest.useRealTimers());

  it('does NOT resolve on the old fixed 500 ms settle when the reply is still in flight', async () => {
    jest.useFakeTimers();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    let done = false;
    engine.armRoomScanWait(500, 3000).then(() => (done = true));

    await jest.advanceTimersByTimeAsync(1400); // reply lagging, as at 13:41:31 (1.5 s)
    expect(done).toBe(false);
  });

  it('resolves once the Exits block arrives (after the grace) and the mob in it is already injected', async () => {
    jest.useFakeTimers();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    const target = { cleanName: 'oversized chipmunk', lookName: 'An oversized chipmunk crouches here.', keywords: ['chipm'] };
    engine.targets = [{ target, lookNameNorm: 'an oversized chipmunk crouches here' }];
    let done = false;
    engine.armRoomScanWait(500, 3000).then(() => (done = true));

    await jest.advanceTimersByTimeAsync(1500);
    rawData(roomBlock('An oversized chipmunk crouches here.'));
    await jest.advanceTimersByTimeAsync(100);
    expect(done).toBe(false); // still inside the grace for split chunks
    await jest.advanceTimersByTimeAsync(200);

    expect(done).toBe(true);
    expect(engine.injectedQueue.map((a: any) => a.kind)).toEqual(['__engage_target']);
  });

  it('keeps the old settle as a floor when the reply is fast', async () => {
    jest.useFakeTimers();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    let done = false;
    engine.armRoomScanWait(500, 3000).then(() => (done = true));

    rawData(roomBlock('A squirrel scurries about here.'));
    await jest.advanceTimersByTimeAsync(300); // grace elapsed, floor (500) not yet
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(250);
    expect(done).toBe(true);
  });

  it('re-arming resolves the previous wait, and rejectAllWaits (stop/cleanup) releases a pending one', async () => {
    jest.useFakeTimers();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    let first = false;
    let second = false;
    engine.armRoomScanWait(0, 3000).then(() => (first = true));
    engine.armRoomScanWait(0, 3000).then(() => (second = true));
    await jest.advanceTimersByTimeAsync(0);
    expect(first).toBe(true); // superseded, never left hanging
    expect(second).toBe(false);

    engine.rejectAllWaits(new Error('stopped'));
    await jest.advanceTimersByTimeAsync(0);
    expect(second).toBe(true);
    expect(engine.roomScanWait).toBeNull();
  });

  it('a path `look` step holds the next step until the reply arrives, not for a fixed delay', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      loopRounds: false,
      idleTimeoutMs: 2000,
      moveSettleMs: 0,
      lookSettleMs: 0,
      postFightSettleMs: 0,
      init: { ...createDefaultAutoLevelConfig().init, trainingPath: 'look;e', targets: [] },
    });
    const { engine } = makeEngine(cfg);
    engine.bind();
    const done = engine.start();

    await waitFor(() => sent.includes('look'));
    await new Promise((r) => setTimeout(r, 400)); // a fixed 0 ms settle would already have moved on
    expect(sent).not.toContain('e');

    rawData(roomBlock('An enlarged squirrel scurries about here.'));
    await waitFor(() => sent.includes('e'));
    emit('shatteredarchive:movement-succeeded', { cmd: 'e', room: { room: 'Next Room', sector: 'inside', exits: [] } });
    await done;
    off();
  }, 10000);

  it('a non-look, non-move path step still uses the fixed settle and never arms a room scan', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      loopRounds: false,
      idleTimeoutMs: 2000,
      moveSettleMs: 0,
      lookSettleMs: 50,
      postFightSettleMs: 0,
      init: { ...createDefaultAutoLevelConfig().init, trainingPath: 'open door', targets: [] },
    });
    const { engine } = makeEngine(cfg);
    engine.bind();
    const armSpy = jest.spyOn(engine, 'armRoomScanWait');
    await engine.start(); // completes with no reply text at all: nothing waits on one

    expect(sent).toContain('open door');
    expect(armSpy).not.toHaveBeenCalled();
    off();
  }, 10000);

  it('after a kill, the re-scan look holds the loop until its reply arrives and a mob in it is engaged', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      loopRounds: false,
      idleTimeoutMs: 2000,
      lookSettleMs: 0,
      postFightSettleMs: 0,
      init: { ...createDefaultAutoLevelConfig().init, trainingPath: '', targets: [] },
      steps: {
        ...createDefaultAutoLevelConfig().steps,
        identify: { pre: [], exec: [{ kind: 'send', cmd: 'look' }], post: [] }, // what the wizard writes
      },
    });
    const { engine } = makeEngine(cfg);
    engine.bind();
    engine.cfg = cfg;
    const target = { cleanName: 'enlarged squirrel', lookName: 'An enlarged squirrel scurries about here.', keywords: ['squirrel'] };
    engine.targets = [{ target, lookNameNorm: 'an enlarged squirrel scurries about here' }];
    engine.injectedQueue.push({ kind: '__engage_target', target });
    engine.encounterLocked = true;

    const flushing = engine.flushInjected(1);
    await waitFor(() => sent.includes('kill squirrel') && engine.engageWait !== null); // armed after the send
    emit('game:char-data', { is_fighting: true });
    await waitFor(() => engine.isFighting === true);
    emit('game:char-data', { is_fighting: false });
    await waitFor(() => sent.includes('look'));

    let flushed = false;
    flushing.then(() => (flushed = true));
    await new Promise((r) => setTimeout(r, 400)); // reply still in flight
    expect(flushed).toBe(false);

    rawData(roomBlock('An enlarged squirrel scurries about here.')); // a second squirrel is still here
    await waitFor(() => sent.filter((c) => c === 'kill squirrel').length === 2);
    off();
    engine.stopping = true;
    emit('game:char-data', { is_fighting: true });
    emit('game:char-data', { is_fighting: false });
    await flushing;
  }, 15000);

  // Live log 2026-11-13 15:46: after a post-fight `cast 'frenzy'` the look was answered 4.5 s later (ability lag); a 3 s cap
  // gave up first and the engine walked on. No reply is a sign of lag: tell the player once, keep waiting, give up only at the cap.
  describe('ability lag (no reply to look)', () => {
    it('keeps waiting past 3 s, tells the player once, and resolves when the late reply arrives', async () => {
      jest.useFakeTimers();
      const { writes, off } = captureTerminalWrites();
      const { engine } = makeEngine(makeConfig());
      engine.bind();
      let done = false;
      engine.armRoomScanWait(500).then(() => (done = true));

      await jest.advanceTimersByTimeAsync(2900);
      expect(writes).toEqual([]); // no notice while a normal reply could still be on its way
      await jest.advanceTimersByTimeAsync(200);
      expect(done).toBe(false); // the old 3 s cap would have released here
      expect(writes.filter((w) => w.includes('probably ability lag'))).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(5000);
      expect(done).toBe(false);
      expect(writes.filter((w) => w.includes('probably ability lag'))).toHaveLength(1); // once, not every second

      rawData(roomBlock('An oversized chipmunk crouches here.')); // the reply, 8 s late
      await jest.advanceTimersByTimeAsync(300);
      expect(done).toBe(true);
      off();
    });

    it('a normal fast reply produces no notice at all', async () => {
      jest.useFakeTimers();
      const { writes, off } = captureTerminalWrites();
      const { engine } = makeEngine(makeConfig());
      engine.bind();
      let done = false;
      engine.armRoomScanWait(500).then(() => (done = true));

      rawData(roomBlock('A squirrel scurries about here.'));
      await jest.advanceTimersByTimeAsync(600);
      expect(done).toBe(true);
      await jest.advanceTimersByTimeAsync(20000);
      expect(writes).toEqual([]);
      off();
    });

    it('gives up only at the hard cap, and says so', async () => {
      jest.useFakeTimers();
      const { writes, off } = captureTerminalWrites();
      const { engine } = makeEngine(makeConfig());
      engine.bind();
      let done = false;
      engine.armRoomScanWait(500).then(() => (done = true));

      await jest.advanceTimersByTimeAsync(19900);
      expect(done).toBe(false);
      await jest.advanceTimersByTimeAsync(200);
      expect(done).toBe(true);
      expect(writes.some((w) => w.includes('no reply to look after 20s'))).toBe(true);
      off();
    });

    it('a sightless reply with no Exits line (a dark room, blindness) counts as the answer', async () => {
      jest.useFakeTimers();
      const { engine } = makeEngine(makeConfig());
      engine.bind();
      let done = false;
      engine.armRoomScanWait(0).then(() => (done = true));

      rawData('It is pitch black ...\r\n');
      await jest.advanceTimersByTimeAsync(300);
      expect(done).toBe(true);
    });

    it('an explicit hard cap at or below the notice time gives no notice (a caller that wants a short wait)', async () => {
      jest.useFakeTimers();
      const { writes, off } = captureTerminalWrites();
      const { engine } = makeEngine(makeConfig());
      engine.bind();
      let done = false;
      engine.armRoomScanWait(0, 2000).then(() => (done = true));

      await jest.advanceTimersByTimeAsync(2100);
      expect(done).toBe(true);
      expect(writes.some((w) => w.includes('probably ability lag'))).toBe(false);
      off();
    });
  });

  it('ignores text without an Exits line, and gives up at the max wait', async () => {
    jest.useFakeTimers();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    let done = false;
    engine.armRoomScanWait(500, 3000).then(() => (done = true));

    rawData('You are hungry.\r\n');
    await jest.advanceTimersByTimeAsync(2900);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(200);
    expect(done).toBe(true);
  });
});

describe('rest step (during-round threshold rules)', () => {
  it('restRuleTriggered requires ALL present thresholds to be at/below their percentage', () => {
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { hp: 40, max_hp: 100, mana: 60, max_mana: 100 }); // hp 40%, mp 60%

    expect(engine.restRuleTriggered({ hp: 50, recoverTo: {} })).toBe(true); // 40 <= 50
    expect(engine.restRuleTriggered({ mp: 50, recoverTo: {} })).toBe(false); // 60 > 50
    expect(engine.restRuleTriggered({ hp: 50, mp: 50, recoverTo: {} })).toBe(false); // AND — mp fails
    expect(engine.restRuleTriggered({ hp: 50, mp: 70, recoverTo: {} })).toBe(true); // AND — both pass
    expect(engine.restRuleTriggered({ recoverTo: {} })).toBe(false); // no thresholds -> never triggers
  });

  it('checkDuringRoundRest never fires while fighting', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      rest: {
        startOfRound: [{ kind: 'send', cmd: 'wake' }],
        endOfRound: [{ kind: 'send', cmd: 'sleep' }],
        duringRound: [{ hp: 50, recoverTo: { hp: 90 } }],
      },
    });
    const { engine } = makeEngine(cfg);
    engine.bind();
    emit('game:char-data', { hp: 10, max_hp: 100, is_fighting: true }); // low hp, but fighting

    await engine.checkDuringRoundRest(1);
    expect(sent).toEqual([]);
    off();
  });

  it('checkDuringRoundRest sleeps, waits for recovery, then wakes — out of combat only', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      rest: {
        startOfRound: [{ kind: 'send', cmd: 'wake' }],
        endOfRound: [{ kind: 'send', cmd: 'sleep' }],
        duringRound: [{ hp: 50, recoverTo: { hp: 90 } }],
      },
    });
    const { engine } = makeEngine(cfg);
    engine.bind();
    emit('game:char-data', { hp: 10, max_hp: 100, is_fighting: false });

    const p = engine.checkDuringRoundRest(1);
    // Recovered vitals, set synchronously before awaiting — charVitals is already current by
    // the time the (timer-free, all-microtask) sleep action resolves and the poll loop checks.
    emit('game:char-data', { hp: 95, max_hp: 100 });
    await p;

    expect(sent).toEqual(['sleep', 'wake']);
    off();
  });

  it('routes rest.startOfRound/endOfRound through sendThroughCommandProcessor when wired, not the raw send event', async () => {
    const { sent, off } = captureSends(); // raw shatteredarchive:send-command listener
    const viaProcessor: string[] = [];
    const cfg = makeConfig({
      rest: {
        startOfRound: [{ kind: 'send', cmd: 'wake' }],
        endOfRound: [{ kind: 'send', cmd: 'sleep' }],
        duringRound: [{ hp: 50, recoverTo: { hp: 90 } }],
      },
    });
    const engine = new AutoLevelingEngine({
      getConfig: () => cfg,
      setRunState: () => {},
      sendThroughCommandProcessor: (cmd) => viaProcessor.push(cmd),
    }) as any;
    engine.bind();
    emit('game:char-data', { hp: 10, max_hp: 100, is_fighting: false });

    const p = engine.checkDuringRoundRest(1);
    emit('game:char-data', { hp: 95, max_hp: 100 });
    await p;

    expect(viaProcessor).toEqual(['sleep', 'wake']); // an aliased "sleep"/"wake" now actually expands
    expect(sent).toEqual([]); // NOT the raw literal path — that's what silently ate an alias before
    off();
  });

  it('does not route a non-rest send (e.g. a buff) through sendThroughCommandProcessor', async () => {
    const { sent, off } = captureSends();
    const viaProcessor: string[] = [];
    const engine = new AutoLevelingEngine({
      getConfig: () => makeConfig(),
      setRunState: () => {},
      sendThroughCommandProcessor: (cmd) => viaProcessor.push(cmd),
    }) as any;
    engine.bind();

    await engine.execAction({ kind: 'send', cmd: 'battle cry' }, 1, 'start.pre');

    expect(sent).toEqual(['battle cry']); // buffs/fight/movement stay on the raw path
    expect(viaProcessor).toEqual([]);
    off();
  });
});

describe('weight gate', () => {
  it('never fires while fighting', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ weight: { atOrAbovePct: 90, commands: [{ kind: 'send', cmd: 'drop gold' }] } });
    const { engine } = makeEngine(cfg);
    engine.bind();
    emit('game:char-data', { carry_weight: 950, can_carry_weight: 1000, is_fighting: true });

    await engine.checkWeightGate(1);
    expect(sent).toEqual([]);
    off();
  });

  it('does nothing when the command list is empty (no separate on/off flag)', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ weight: { atOrAbovePct: 90, commands: [] } });
    const { engine } = makeEngine(cfg);
    engine.bind();
    emit('game:char-data', { carry_weight: 999, can_carry_weight: 1000 });

    await engine.checkWeightGate(1);
    expect(sent).toEqual([]);
    off();
  });

  it('never fires when max-carry data is absent (0 fallback, not "always overweight")', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ weight: { atOrAbovePct: 90, commands: [{ kind: 'send', cmd: 'drop gold' }] } });
    const { engine } = makeEngine(cfg);
    engine.bind();
    // no game:char-data at all -> carryWeightMax stays 0

    await engine.checkWeightGate(1);
    expect(sent).toEqual([]);
    off();
  });

  it('fires once at threshold crossing, not again while still over, then can re-fire after dropping below', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ weight: { atOrAbovePct: 90, commands: [{ kind: 'send', cmd: 'drop gold' }] } });
    const { engine } = makeEngine(cfg);
    engine.bind();

    emit('game:char-data', { carry_weight: 950, can_carry_weight: 1000 }); // 95% >= 90%
    await engine.checkWeightGate(1);
    await engine.checkWeightGate(1); // still 95% -> must not resend
    expect(sent).toEqual(['drop gold']);

    emit('game:char-data', { carry_weight: 500, can_carry_weight: 1000 }); // back under threshold
    await engine.checkWeightGate(1);
    expect(sent).toEqual(['drop gold']); // no re-fire just from dropping below

    emit('game:char-data', { carry_weight: 960, can_carry_weight: 1000 }); // crosses again
    await engine.checkWeightGate(1);
    expect(sent).toEqual(['drop gold', 'drop gold']);
    off();
  });
});

describe('flee-pause + resume resync', () => {
  it('boundOnFlee pauses the engine on both flee success and flee failure', () => {
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    expect(engine.paused).toBe(false);
    emit('event:flee:success', {});
    expect(engine.paused).toBe(true);

    engine.resume();
    expect(engine.paused).toBe(false);

    emit('event:flee:failed', {});
    expect(engine.paused).toBe(true);
  });

  it('waitWhilePausedOrStopped sends a fresh look/identify only when actually resuming from a pause', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ lookSettleMs: 0 });
    const { engine } = makeEngine(cfg);
    engine.bind();

    // Never paused -> resolves immediately, no resync send.
    await engine.waitWhilePausedOrStopped();
    expect(sent).toEqual([]);

    // Paused -> resumed mid-wait -> exactly one resync send once it unblocks.
    engine.pause();
    const p = engine.waitWhilePausedOrStopped();
    await new Promise((r) => setTimeout(r, 60)); // let the 50ms poll loop see it's still paused
    expect(sent).toEqual([]);
    engine.resume();
    await p;
    expect(sent.length).toBe(1); // bare `look` (no identify actions configured by default)
    off();
  });

  it('waitForRecovery takes no action and freezes its timeout while paused, then resumes polling the real condition', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ lookSettleMs: 0 });
    const { engine } = makeEngine(cfg);
    engine.bind();
    emit('game:char-data', { hp: 10, max_hp: 100 });

    engine.pause();
    // A timeout short enough that it would fire if paused time counted toward it.
    const p = engine.waitForRecovery({ hp: 90 }, 500);
    await new Promise((r) => setTimeout(r, 200)); // longer than the "timeout" while still paused
    engine.resume();
    emit('game:char-data', { hp: 95, max_hp: 100 });
    await p;

    // Resolved via the real recovery condition post-resume, not a timeout give-up —
    // and exactly the one resync-on-resume send, no extra action taken while paused.
    expect(sent.length).toBe(1);
    off();
  });
});

describe('run-control terminal notices', () => {
  it('writes "paused"/"resumed" lines on actual pause/resume transitions', () => {
    const { writes, off } = captureTerminalWrites();
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    engine.pause();
    engine.resume();
    off();

    expect(writes).toHaveLength(2);
    expect(writes[0]).toContain('[auto-level]');
    expect(writes[0]).toContain('paused');
    expect(writes[1]).toContain('resumed');
  });

  it('writes nothing extra on a no-op pause()/resume() call', () => {
    const { writes, off } = captureTerminalWrites();
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    engine.resume(); // not paused — no-op
    engine.pause();
    engine.pause(); // already paused — no-op
    off();

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('paused');
  });

  it('writes a "stopping..." line when stop() is called', () => {
    const { writes, off } = captureTerminalWrites();
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    engine.stop();
    off();

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('stopping');
  });

  it('writes "started" then "stopped" across a full natural-completion run', async () => {
    const { sent, off: offSends } = captureSends();
    const { writes, off: offWrites } = captureTerminalWrites();
    const cfg = makeConfig({
      loopRounds: false,
      idleTimeoutMs: 2000,
      moveSettleMs: 0,
      lookSettleMs: 0,
      postFightSettleMs: 0,
      init: { ...createDefaultAutoLevelConfig().init, trainingPath: 'n', targets: [] },
    });

    const { engine } = makeEngine(cfg);
    engine.bind();
    const done = engine.start();

    await waitFor(() => sent.includes('n'));
    emit('shatteredarchive:movement-succeeded', { cmd: 'n', room: { room: 'Some Room', sector: 'inside', exits: [] } });
    await done;
    offSends();
    offWrites();

    expect(writes).toHaveLength(2);
    expect(writes[0]).toContain('started');
    expect(writes[0]).toContain('auto_level');
    expect(writes[1]).toContain('stopped');
  }, 10000);

  it('writes an "error:" line and never "started" when start() rejects an invalid config', async () => {
    const { writes, off } = captureTerminalWrites();
    const cfg = makeConfig({ mode: 'disabled' });
    const { engine } = makeEngine(cfg);
    engine.bind();

    await engine.start();
    off();

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('error:');
    expect(writes[0]).toContain('disabled');
  });

  // Each guard refuses the run with its own state: nothing is sent, the run never reports "started", and the reason is in the run state.
  it.each([
    ['a disabled mode', { mode: 'disabled' as const }, 'Auto leveling is disabled'],
    ['no training path', { init: { ...createDefaultAutoLevelConfig().init, trainingPath: '' } }, 'Training path is undefined'],
    ['a training path with no steps in it', { init: { ...createDefaultAutoLevelConfig().init, trainingPath: ' ; ;' } }, 'Training path step length is 0'],
  ])('refuses to start with %s, and says why in the run state', async (_label, over, message) => {
    const { sent, off } = captureSends();
    const { writes, off: offWrites } = captureTerminalWrites();
    const { engine, runStates } = makeEngine(makeConfig(over as Partial<AutoLevelConfig>));
    engine.bind();

    await engine.start();
    off();
    offWrites();

    expect(runStates).toContainEqual({ status: 'error', message });
    expect(sent).toEqual([]);
    expect(writes.some((w) => w.includes('started'))).toBe(false);
  });

  it('stopping while paused releases the round loop at its next step instead of hanging', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      loopRounds: false,
      moveSettleMs: 0,
      lookSettleMs: 0,
      init: { ...createDefaultAutoLevelConfig().init, trainingPath: 'n;e', targets: [] },
    });
    const { engine, runStates } = makeEngine(cfg);
    engine.bind();
    const done = engine.start();

    await waitFor(() => sent.includes('n'));
    engine.pause();
    emit('shatteredarchive:movement-succeeded', { cmd: 'n', room: { room: 'R', sector: 'inside', exits: [] } });
    await new Promise((r) => setTimeout(r, 100));
    engine.stop();
    await done;
    off();

    expect(sent).not.toContain('e'); // the second step never went out
    expect(runStates[runStates.length - 1]).toMatchObject({ status: 'idle' });
  }, 10000);
});

describe('refreshRunSnapshot (pause-to-edit resync for targets/buffs/route, step 12)', () => {
  it('this.cfg/this.targets only refresh on an actual pause->resume transition, never while running unpaused', async () => {
    let cfg = makeConfig({
      lookSettleMs: 0,
      init: {
        ...createDefaultAutoLevelConfig().init,
        trainingPath: 'n',
        targets: [{ cleanName: 'orc', name: 'orc', lookName: 'orc', keywords: ['orc'] }],
      },
    });
    const engine = new AutoLevelingEngine({
      getConfig: () => cfg,
      setRunState: () => {},
    }) as any;
    engine.bind();

    // Seed this.cfg/this.targets the way start() does, without driving a full round loop.
    engine.cfg = cfg;
    engine.refreshTargets(cfg);
    expect(engine.targets.map((t: any) => t.target.lookName)).toEqual(['orc']);

    // A live edit — a brand-new config object (mirrors setConfig(draftToConfig(draft)) in the
    // real app), not an in-place mutation of the old one.
    cfg = {
      ...cfg,
      init: {
        ...cfg.init,
        targets: [...cfg.init.targets, { cleanName: 'goblin', name: 'goblin', lookName: 'goblin', keywords: ['goblin'] }],
      },
    };

    // Never paused -> resolves immediately, no resync -> the new target is NOT picked up yet.
    await engine.waitWhilePausedOrStopped();
    expect(engine.targets.map((t: any) => t.target.lookName)).toEqual(['orc']);

    // Paused -> resumed -> exactly one resync, which now picks up the live edit.
    engine.pause();
    const p = engine.waitWhilePausedOrStopped();
    engine.resume();
    await p;
    expect(engine.targets.map((t: any) => t.target.lookName)).toEqual(['orc', 'goblin']);
  });
});

describe('if_affect_missing gating', () => {
  it('skips the cast while the affect is live, sends it when absent', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    emit('game:affects-trueup', [{ n: 'sanctuary' }]);
    await engine.execAction({ kind: 'if_affect_missing', affectName: 'sanctuary', cmd: "cast 'sanctuary'", retry: false }, 1);
    expect(sent).not.toContain("cast 'sanctuary'");

    emit('game:affect-removed', { n: 'sanctuary' });
    await engine.execAction({ kind: 'if_affect_missing', affectName: 'sanctuary', cmd: "cast 'sanctuary'", retry: false }, 1);
    expect(sent).toContain("cast 'sanctuary'");
    off();
  });
});

describe('vitalsGate', () => {
  it('blocks a "below" gate at/above threshold, fires under it', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    const act: AutoLevelAction = {
      kind: 'send',
      cmd: 'cast cure critical',
      vitalsGate: { stat: 'hp', op: 'below', pct: 80 },
    };

    emit('game:char-data', { hp: 90, max_hp: 100 }); // 90% — at/above 80 → blocked
    await engine.execAction(act, 1);
    expect(sent).toEqual([]);

    emit('game:char-data', { hp: 70, max_hp: 100 }); // 70% — under 80 → fires
    await engine.execAction(act, 1);
    expect(sent).toEqual(['cast cure critical']);
    off();
  });

  it('blocks an "above" gate at/below threshold, fires over it', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    const act: AutoLevelAction = {
      kind: 'send',
      cmd: "cast 'faerie fire'",
      vitalsGate: { stat: 'mp', op: 'above', pct: 80 },
    };

    emit('game:char-data', { mana: 80, max_mana: 100 }); // 80% — at/below 80 → blocked
    await engine.execAction(act, 1);
    expect(sent).toEqual([]);

    emit('game:char-data', { mana: 90, max_mana: 100 }); // 90% — over 80 → fires
    await engine.execAction(act, 1);
    expect(sent).toEqual(["cast 'faerie fire'"]);
    off();
  });

  it('never blocks when max-vitals data is missing/zero (no char_data seen yet)', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    await engine.execAction(
      { kind: 'send', cmd: 'gore', vitalsGate: { stat: 'mv', op: 'above', pct: 80 } },
      1,
    );
    expect(sent).toEqual(['gore']);
    off();
  });

  it('composes with an action\'s own gate (send_cooldown) as an additional "and" condition', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    const act: AutoLevelAction = {
      kind: 'send_cooldown',
      cmd: 'gore',
      cooldownSec: 0,
      vitalsGate: { stat: 'mv', op: 'above', pct: 80 },
    };

    emit('game:char-data', { move: 50, max_move: 100 }); // 50% — not above 80 → blocked despite cooldown ready
    await engine.execAction(act, 1);
    expect(sent).toEqual([]);

    emit('game:char-data', { move: 90, max_move: 100 }); // 90% — over 80 → fires
    await engine.execAction(act, 1);
    expect(sent).toEqual(['gore']);
    off();
  });
});

describe('round/fight tracking, once-per-X gates, and queue-buildup detection', () => {
  // Verified against the real exported DAMAGE_LINE_PATTERN (combat-compression.plugin.ts).
  const DMG_LINE = "A liger cub's scratch grazes a crystal scarecrow.";

  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('closes a round ~1s after the last damage line with no new one arriving', () => {
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    emit('shatteredarchive:raw-data', { text: DMG_LINE });
    expect(engine.roundsObservedThisEncounter).toBe(0);

    jest.advanceTimersByTime(999);
    expect(engine.roundsObservedThisEncounter).toBe(0);

    jest.advanceTimersByTime(2);
    expect(engine.roundsObservedThisEncounter).toBe(1);
  });

  it('a new damage line pushes the round boundary back out (debounced)', () => {
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    emit('shatteredarchive:raw-data', { text: DMG_LINE });
    jest.advanceTimersByTime(700);
    emit('shatteredarchive:raw-data', { text: DMG_LINE }); // resets the 1s window
    jest.advanceTimersByTime(700);
    expect(engine.roundsObservedThisEncounter).toBe(0); // only 700ms since the 2nd line

    jest.advanceTimersByTime(301);
    expect(engine.roundsObservedThisEncounter).toBe(1);
  });

  it('onceKey "round" fires once per round and resets on the next round boundary', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    const act: AutoLevelAction = { kind: 'send', cmd: 'shield block', onceKey: 'round' };
    await engine.execAction(act, 1);
    expect(sent).toEqual(['shield block']);
    await engine.execAction(act, 1);
    expect(sent).toEqual(['shield block']); // still only once this round

    emit('shatteredarchive:raw-data', { text: DMG_LINE });
    jest.advanceTimersByTime(1000); // round boundary -> clears the once-per-round set

    await engine.execAction(act, 1);
    expect(sent).toEqual(['shield block', 'shield block']);
    off();
  });

  it('onceKey "fight" fires once for the whole encounter and resets on the next encounter', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    const act: AutoLevelAction = { kind: 'send', cmd: 'battle cry', onceKey: 'fight' };
    await engine.execAction(act, 1);
    expect(sent).toEqual(['battle cry']);

    emit('shatteredarchive:raw-data', { text: DMG_LINE });
    jest.advanceTimersByTime(1000); // a round boundary — must NOT reset the fight-set
    await engine.execAction(act, 1);
    expect(sent).toEqual(['battle cry']); // still gated

    emit('game:char-data', { is_fighting: false });
    emit('game:char-data', { is_fighting: true }); // a new encounter — resets it
    await engine.execAction(act, 1);
    expect(sent).toEqual(['battle cry', 'battle cry']);
    off();
  });

  it("a kind-specific gate that skips the send doesn't consume the once-per-X slot", async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    const act: AutoLevelAction = {
      kind: 'if_affect_missing',
      affectName: 'sanctuary',
      cmd: "cast 'sanctuary'",
      onceKey: 'fight',
      retry: false,
    };
    emit('game:affects-trueup', [{ n: 'sanctuary' }]); // affect live -> gate skips the send
    await engine.execAction(act, 1);
    expect(sent).toEqual([]);

    emit('game:affect-removed', { n: 'sanctuary' }); // affect drops -> now it actually fires
    await engine.execAction(act, 1);
    expect(sent).toEqual(["cast 'sanctuary'"]);
    off();
  });

  it('hasQueueBuildup() flips true once sends outpace observed rounds, resets per encounter', async () => {
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });
    expect(engine.hasQueueBuildup()).toBe(false);

    // Two sends with no round observed yet -> commandsSent(2) > roundsObserved(0)
    await engine.execAction({ kind: 'send', cmd: 'a' }, 1);
    await engine.execAction({ kind: 'send', cmd: 'b' }, 1);
    expect(engine.hasQueueBuildup()).toBe(true);

    // A round completes -> commandsSent(2) > roundsObserved(1), still true
    emit('shatteredarchive:raw-data', { text: DMG_LINE });
    jest.advanceTimersByTime(1000);
    expect(engine.hasQueueBuildup()).toBe(true);

    // A new encounter resets both counters
    emit('game:char-data', { is_fighting: false });
    emit('game:char-data', { is_fighting: true });
    expect(engine.hasQueueBuildup()).toBe(false);
  });

  it('a clean 1-send-per-round encounter never triggers queue buildup', async () => {
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    await engine.execAction({ kind: 'send', cmd: 'bash' }, 1);
    emit('shatteredarchive:raw-data', { text: DMG_LINE });
    jest.advanceTimersByTime(1000); // round 1 closes: sent=1, rounds=1

    expect(engine.hasQueueBuildup()).toBe(false);
  });

  it('flags per-command queue buildup when a fight-command re-fires within the same round', async () => {
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    const act: AutoLevelAction = { kind: 'send_cooldown', cmd: 'gore', cooldownSec: 0 };
    await engine.execAction(act, 1);
    await engine.execAction(act, 1); // same round, same cmd re-fires -> buildup

    expect(engine.commandsWithQueueBuildup.has('gore')).toBe(true);
  });

  it('notifies onAbilityCooldownLearned with the bumped value on per-command buildup', async () => {
    // cooldownSec: 0 — a non-zero cooldown would itself block the 2nd execAction call within
    // the same synchronous test (its own gate needs real elapsed time to pass), which would
    // mask the once-per-round buildup signal this test is actually about.
    const learned: Array<{ cmd: string; cooldownSec: number }> = [];
    const engine = new AutoLevelingEngine({
      getConfig: () => makeConfig(),
      setRunState: () => {},
      onAbilityCooldownLearned: (cmd, cooldownSec) => learned.push({ cmd, cooldownSec }),
    }) as any;
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    const act: AutoLevelAction = { kind: 'send_cooldown', cmd: 'gore', cooldownSec: 0 };
    await engine.execAction(act, 1);
    expect(learned).toEqual([]); // first send this round — nothing to learn yet

    await engine.execAction(act, 1); // re-fires within the same round -> bump from 0 + 0.5
    expect(learned).toEqual([{ cmd: 'gore', cooldownSec: 0.5 }]);
  });

  it('writes a terminal heads-up when it auto-bumps a cooldown, so the change is never silent', async () => {
    const { writes, off } = captureTerminalWrites();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    const act: AutoLevelAction = { kind: 'send_cooldown', cmd: 'gore', cooldownSec: 0 };
    await engine.execAction(act, 1);
    expect(writes.some((w) => w.includes('gore'))).toBe(false); // first send — nothing learned yet

    await engine.execAction(act, 1); // re-fires within the same round -> bump + notice
    const notice = writes.find((w) => w.includes('heads up'));
    expect(notice).toBeDefined();
    expect(notice).toContain('"gore"');
    expect(notice).toContain('0s → 0.5s');
    off();
  });

  it('escalates cumulatively across repeated buildups this run, instead of re-learning the same bump forever', async () => {
    const learned: Array<{ cmd: string; cooldownSec: number }> = [];
    const engine = new AutoLevelingEngine({
      getConfig: () => makeConfig(),
      setRunState: () => {},
      onAbilityCooldownLearned: (cmd, cooldownSec) => learned.push({ cmd, cooldownSec }),
    }) as any;
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    const act: AutoLevelAction = { kind: 'send_cooldown', cmd: 'kick', cooldownSec: 0 };
    await engine.execAction(act, 1); // first send this round — nothing to learn yet
    await engine.execAction(act, 1); // re-fires -> bumps configured 0 -> 0.5

    jest.advanceTimersByTime(600); // clear the just-learned 0.5s gate so a 3rd send can go through
    await engine.execAction(act, 1); // re-fires again -> must bump from the learned 0.5, not from 0 again

    expect(learned).toEqual([
      { cmd: 'kick', cooldownSec: 0.5 },
      { cmd: 'kick', cooldownSec: 1 },
    ]);
  });

  it('clearQueueIfBuiltUp() sends ~ when the encounter\'s sends outpaced observed rounds', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    await engine.execAction({ kind: 'send', cmd: 'a' }, 1);
    await engine.execAction({ kind: 'send', cmd: 'b' }, 1); // sent=2, rounds=0 -> buildup

    await engine.clearQueueIfBuiltUp();
    expect(sent).toEqual(['a', 'b', '~']);
    off();
  });

  it('clearQueueIfBuiltUp() sends nothing for a clean 1-send-per-round encounter', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });

    await engine.execAction({ kind: 'send', cmd: 'bash' }, 1);
    emit('shatteredarchive:raw-data', { text: DMG_LINE });
    jest.advanceTimersByTime(1000); // round 1 closes: sent=1, rounds=1 -> no buildup

    await engine.clearQueueIfBuiltUp();
    expect(sent).toEqual(['bash']); // no trailing '~'
    off();
  });
});

describe('send_cooldown', () => {
  it('fires once, then again only after the cooldown elapses', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    const act: AutoLevelAction = { kind: 'send_cooldown', cmd: 'bash', cooldownSec: 10 };
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(1_000_000);
      await engine.execAction(act, 1);
      expect(sent).toEqual(['bash']);

      nowSpy.mockReturnValue(1_005_000); // 5s < 10s → cooling
      await engine.execAction(act, 1);
      expect(sent).toEqual(['bash']);

      nowSpy.mockReturnValue(1_011_000); // 11s → past cooldown
      await engine.execAction(act, 1);
      expect(sent).toEqual(['bash', 'bash']);
    } finally {
      nowSpy.mockRestore();
      off();
    }
  });

  it('seedLearnedCooldowns() pulls a persisted learned cooldown so it gates from the first send, not just after re-learning it', async () => {
    const cfg = makeConfig({
      steps: {
        ...createDefaultAutoLevelConfig().steps,
        fight: { pre: [], exec: [{ kind: 'send_cooldown', cmd: 'kick', cooldownSec: 0 }], post: [] },
      },
    });
    const engine = new AutoLevelingEngine({
      getConfig: () => cfg,
      setRunState: () => {},
      getLearnedCooldown: async (cmd) => (cmd === 'kick' ? 1.5 : null),
    }) as any;
    engine.cfg = cfg; // normally set by start() before it calls seedLearnedCooldowns()

    await engine.seedLearnedCooldowns();

    expect(engine.learnedCooldownSec.get('kick')).toBe(1.5);
  });
});

describe('start.pre buff settle (several buffs at once must not outrun real MUD cast lag)', () => {
  it('waits lookSettleMs between each buff in start.pre', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ lookSettleMs: 60 });
    const { engine } = makeEngine(cfg);
    engine.bind();
    engine.cfg = cfg; // normally set by start() before the round loop calls runActions()

    const actions: AutoLevelAction[] = [
      { kind: 'send', cmd: 'cast one' },
      { kind: 'send', cmd: 'cast two' },
    ];

    const done = engine.runActions(actions, 'start.pre', 1);

    await waitFor(() => sent.includes('cast one'));
    expect(sent).toEqual(['cast one']); // second buff must not fire before the settle elapses

    await done;
    expect(sent).toEqual(['cast one', 'cast two']);
    off();
  });

  it('does not add a settle delay for other steps (e.g. move.pre)', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ lookSettleMs: 500 });
    const { engine } = makeEngine(cfg);
    engine.bind();

    const actions: AutoLevelAction[] = [
      { kind: 'send', cmd: 'one' },
      { kind: 'send', cmd: 'two' },
    ];

    await engine.runActions(actions, 'move.pre', 1);
    expect(sent).toEqual(['one', 'two']); // both fire with no timer advance needed
    off();
  });
});

describe('send_every_ticks', () => {
  it('fires immediately, then re-fires only after N game:tick events', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    const act: AutoLevelAction = { kind: 'send_every_ticks', cmd: 'berserk', everyTicks: 3 };

    await engine.execAction(act, 1); // first cast — nothing recorded yet
    expect(sent).toEqual(['berserk']);

    await engine.execAction(act, 1); // 0 ticks since → skip
    expect(sent).toEqual(['berserk']);

    emit('game:tick', {});
    emit('game:tick', {});
    await engine.execAction(act, 1); // 2 ticks < 3 → skip
    expect(sent).toEqual(['berserk']);

    emit('game:tick', {});
    await engine.execAction(act, 1); // 3 ticks → fire
    expect(sent).toEqual(['berserk', 'berserk']);
    off();
  });

  it('never fires while in combat', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true });
    await engine.execAction({ kind: 'send_every_ticks', cmd: 'berserk', everyTicks: 0 }, 1);
    expect(sent).toEqual([]);
    emit('game:char-data', { is_fighting: false });
    await engine.execAction({ kind: 'send_every_ticks', cmd: 'berserk', everyTicks: 0 }, 1);
    expect(sent).toEqual(['berserk']);
    off();
  });
});

describe('criticalBuffs mid-fight reaction', () => {
  it('fires inCombatCmd when a watched affect drops mid-fight; nothing for a plain one', () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      criticalBuffs: [
        { affect: 'sanctuary', cmd: "cast 'sanctuary'", inCombatCmd: 'quaff divine' },
        { affect: 'frenzy', cmd: "cast 'frenzy'" },
      ],
    });
    const { engine } = makeEngine(cfg);
    engine.bind();

    emit('game:char-data', { is_fighting: true });
    expect(engine.isFighting).toBe(true);

    emit('game:affect-removed', { n: 'sanctuary' });
    expect(sent).toContain('quaff divine');

    // no item action → nothing mid-fight; the recast is left to the post-combat recheck
    emit('game:affect-removed', { n: 'frenzy' });
    expect(sent).not.toContain("cast 'frenzy'");

    // out of combat the drop does nothing either — recheckBuffs owns the recast
    sent.length = 0;
    emit('game:char-data', { is_fighting: false });
    emit('game:affect-removed', { n: 'sanctuary' });
    expect(sent).toEqual([]);
    off();
  });
});

describe('post-combat buff recheck', () => {
  it('recasts affect-gated + tick buffs whose affect is missing, skips active ones and bare sends', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      steps: {
        ...createDefaultAutoLevelConfig().steps,
        start: {
          pre: [
            { kind: 'if_affect_missing', affectName: 'sanctuary', cmd: "cast 'sanctuary'", retry: false },
            { kind: 'if_affect_missing', affectName: 'armor', cmd: "cast 'armor'", retry: false },
            { kind: 'send_every_ticks', cmd: 'berserk', everyTicks: 0 },
            { kind: 'send', cmd: 'RALLY_CRY' }, // "every round" — must NOT re-fire post-combat
          ],
          exec: [],
          post: [],
        },
      },
    });
    const { engine } = makeEngine(cfg);
    engine.bind();
    emit('game:affects-trueup', [{ n: 'armor' }]); // armor still up, sanctuary is not

    await engine.recheckBuffs(1, 'test');

    expect(sent).toContain("cast 'sanctuary'"); // missing → recast
    expect(sent).not.toContain("cast 'armor'"); // still active → skipped
    expect(sent).toContain('berserk'); // tick buff, out of combat → fires
    expect(sent).not.toContain('RALLY_CRY'); // every-round buff → only at top of round
    off();
  });
});

describe('XP-progress terminal line', () => {
  it('writes a bright kills-to-level estimate on each XP gain while running', () => {
    const { writes, off } = captureTerminalWrites();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    engine.running = true; // simulate an active run

    emit('game:char-data', { tnl: 10000 });
    emit('game:char-data', { tnl: 9000 }); // +1000 xp, est 1000 → ~9 kills to level
    off();

    expect(writes).toHaveLength(1);
    const line = writes[0];
    expect(line).toContain('[auto-level]');
    expect(line).toContain('+1,000 xp');
    expect(line).toMatch(/~9 kills to level/);
    expect(line).toContain('9,000 tnl');
    expect(line).toContain('avg 1,000 xp/kill over 1');
    expect(line).toContain(String.fromCharCode(27) + '['); // carries an ANSI colour
  });

  it('says nothing when the engine is not running', () => {
    const { writes, off } = captureTerminalWrites();
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    emit('game:char-data', { tnl: 10000 });
    emit('game:char-data', { tnl: 9000 });
    off();

    expect(writes).toHaveLength(0);
  });
});

describe('holdNearLevel', () => {
  it('is not re-cast while tnl is at/below the kill-XP estimate', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      playerAlignment: 'evil',
      targetAlignment: 'evil', // same → 0.5× modifier
      criticalBuffs: [{ affect: 'haste', cmd: "cast 'haste'", holdNearLevel: true }],
    });
    const { engine } = makeEngine(cfg);
    engine.bind();

    emit('game:char-data', { tnl: 1000 });
    emit('game:char-data', { tnl: 600 }); // drop 400 / 0.5 = 800 base; est = 800 * 0.5 = 400
    expect(engine.estKillXp).toBe(400);

    emit('game:char-data', { tnl: 300 }); // 300 <= est → near level-up
    expect(engine.nearLevelUp()).toBe(true);

    await engine.execAction({ kind: 'if_affect_missing', affectName: 'haste', cmd: "cast 'haste'", retry: false }, 1);
    expect(sent).not.toContain("cast 'haste'");

    // a non-held buff is unaffected
    await engine.execAction({ kind: 'if_affect_missing', affectName: 'sanctuary', cmd: "cast 'sanctuary'", retry: false }, 1);
    expect(sent).toContain("cast 'sanctuary'");

    // and recheckBuffs leaves a held buff alone while near level
    sent.length = 0;
    await engine.recheckBuffs(1, 'test');
    expect(sent).not.toContain("cast 'haste'");
    off();
  });
});

describe('mob alignment from auras', () => {
  const auraLine = (s: string) => emit('shatteredarchive:raw-data', { text: s });

  it('reads good/evil from the (Golden Aura) / (Red Aura) line prefix', () => {
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    auraLine('([0;31mRed Aura[0m) An alley cat sits here, devouring food scraps.');
    expect(engine.currentTargetAlignment).toBe('evil');

    auraLine('(Translucent) (Golden Aura) (Hostile) A manticore rampages here.');
    expect(engine.currentTargetAlignment).toBe('good');

    auraLine('A plain unaligned rat scurries about.'); // no aura → unchanged
    expect(engine.currentTargetAlignment).toBe('good');

    // White / Blue / Thorn etc. are not alignment — leave it alone
    auraLine('(Thorn Aura) (White Aura) A blessed sanctified acolyte kneels here.');
    expect(engine.currentTargetAlignment).toBe('good');
  });

  it('feeds the kill-XP modifier (evil player vs golden-aura mob → 2×)', () => {
    const { writes, off } = captureTerminalWrites();
    const { engine } = makeEngine(makeConfig({ playerAlignment: 'evil' }));
    engine.bind();
    engine.running = true;

    auraLine('(Golden Aura) A radiant dryad tends the grove.');
    emit('game:char-data', { tnl: 10000 });
    emit('game:char-data', { tnl: 9000 }); // drop 1000, mod 2 → base 500, est = 500 * 2 = 1000
    expect(engine.estKillXp).toBe(1000);
    expect(writes[0]).toContain('~9 kills to level');
    off();
  });
});

describe('commands reach the game as real commands (live findings 2026-11-14, CMDTPL-01)', () => {
  const noPlaceholder = (cmd: string) => !/\{[A-Za-z_]\w*\}|<[A-Za-z][A-Za-z _-]{0,30}>/.test(cmd);

  it('L5: every send path expands {name} with the engaged keyword', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({
      criticalBuffs: [{ affect: 'sanctuary', cmd: "cast 'sanctuary'", inCombatCmd: 'brandish {name}' }],
    });
    const { engine } = makeEngine(cfg);
    engine.bind();
    engine.cfg = cfg;
    engine.engagedKeyword = 'elf';

    await engine.execAction({ kind: 'send', cmd: "cast 'fire' {name}" }, 1);
    await engine.execAction({ kind: 'send_cooldown', cmd: "cast 'frost' {name}", cooldownSec: 0 }, 1);
    await engine.execAction({ kind: 'send_every_ticks', cmd: 'bash {name}', everyTicks: 0 }, 1);
    await engine.execAction({ kind: 'if_affect_missing', affectName: 'bless', cmd: "cast 'bless' {name}", retry: false }, 1);
    await engine.runActions([{ kind: 'send', cmd: 'rest {name}' }], 'rest.endOfRound', 1);
    emit('game:char-data', { is_fighting: true });
    emit('game:affect-removed', { n: 'sanctuary' });
    off();

    expect(sent).toEqual([
      "cast 'fire' elf",
      "cast 'frost' elf",
      'bash elf',
      "cast 'bless' elf",
      'rest elf',
      'brandish elf',
    ]);
    expect(sent.every(noPlaceholder)).toBe(true);
  });

  it('L1: with no target a {name} is dropped with its space, never sent literally', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    await engine.execAction({ kind: 'send', cmd: "cast 'dark heal' {name}" }, 1);
    off();
    expect(sent).toEqual(["cast 'dark heal'"]);
  });

  it('the initiation command is expanded for the keyword it tries', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ init: { ...createDefaultAutoLevelConfig().init, initiationCommand: 'kill {name}' } });
    const { engine } = makeEngine(cfg);
    engine.bind();
    const target = { cleanName: 'an elf', name: 'an elf', lookName: 'an elf', keywords: ['elf'] };
    const done = engine.engageTarget(target, 1);
    await waitFor(() => sent.includes('kill elf'));
    emit('game:char-data', { is_fighting: true });
    expect(await done).toBe(true);
    off();
    expect(sent).toEqual(['kill elf']);
  });

  it('the keyword is forgotten when the fight ends, so a later heal does not target the last mob', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    engine.engagedKeyword = 'elf';
    emit('game:char-data', { is_fighting: true });
    emit('game:char-data', { is_fighting: false });
    await engine.execAction({ kind: 'send', cmd: "cast 'heal' {name}" }, 1);
    off();
    expect(sent).toEqual(["cast 'heal'"]);
  });

  it('L3/L4: an unresolved <placeholder> (a seeded quaff <potion>) is refused with one notice and the run goes on', async () => {
    const { sent, off } = captureSends();
    const term = captureTerminalWrites();
    const cfg = makeConfig({
      criticalBuffs: [{ affect: 'sanctuary', cmd: "cast 'sanctuary'", inCombatCmd: 'quaff <potion>' }],
    });
    const { engine } = makeEngine(cfg);
    engine.bind();
    engine.cfg = cfg;
    emit('game:char-data', { is_fighting: true });
    // the same drop twice: still one notice
    emit('game:affect-removed', { n: 'sanctuary' });
    emit('game:affect-removed', { n: 'sanctuary' });
    await engine.execAction({ kind: 'send', cmd: 'cast x {typo}' }, 1);
    await engine.execAction({ kind: 'send', cmd: 'kick' }, 1);
    off();
    term.off();

    expect(sent).toEqual(['kick']);
    const notices = term.writes.filter((w) => w.includes('not sent'));
    expect(notices).toHaveLength(2); // one for <potion>, one for {typo}
    expect(notices[0]).toContain('<potion>');
    expect(notices[1]).toContain('{typo}');
  });

  it('a colour code in a say is not mistaken for a placeholder', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();
    await engine.execAction({ kind: 'send', cmd: 'say {Rhello' }, 1);
    off();
    expect(sent).toEqual(['say {Rhello']);
  });
});
