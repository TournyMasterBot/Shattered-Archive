// apps/game-client/src/features/autoleveling/autoleveling-engine.rearm.test.ts
//
// Re-arming buffs and heals (live findings 2026-11-14, items 1, 2, 3 and 6; RUNLOOP-03): one command in flight, outcome read from the
// game's own words, a capped lag-spaced retry, item buffs used whenever the affect drops. The engine talks to the real window event bus
// (jsdom); timers are fake so the retry gaps cost no real time.

import { AutoLevelingEngine } from './autoleveling-engine';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import type { AutoLevelAction, AutoLevelConfig, AutoLevelCriticalBuff } from './autoleveling-types';

const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const rawText = (text: string) => emit('shatteredarchive:raw-data', { text, rawText: text, fromUserScript: false });
const fight = (on: boolean) => emit('game:char-data', { is_fighting: on });

function captureSends() {
  const sent: { cmd: string; at: number }[] = [];
  const listener = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { cmd?: unknown };
    if (d && typeof d.cmd === 'string') sent.push({ cmd: d.cmd, at: Date.now() });
  };
  window.addEventListener('shatteredarchive:send-command', listener);
  return { sent, cmds: () => sent.map((s) => s.cmd), off: () => window.removeEventListener('shatteredarchive:send-command', listener) };
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

function makeEngine(criticalBuffs: AutoLevelCriticalBuff[] = []) {
  const cfg: AutoLevelConfig = { ...createDefaultAutoLevelConfig(), mode: 'auto_level', lookSettleMs: 0, criticalBuffs };
  const engine = new AutoLevelingEngine({ getConfig: () => cfg, setRunState: () => {} }) as any;
  engine.bind();
  engine.cfg = cfg;
  engine.running = true; // a run is going: out-of-combat item re-arms are allowed
  return engine;
}

const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
const SPELL: AutoLevelAction = { kind: 'if_affect_missing', affectName: 'bless', cmd: "cast 'bless'" };

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('a failed cast is retried: capped, spaced, and given up once (L13, L15)', () => {
  it('retries after "You lost your concentration." once the gap has passed, and stops when the affect shows', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    const done = engine.execAction(SPELL, 1);
    expect(cmds()).toEqual(["cast 'bless'"]);

    rawText('You lost your concentration.\r\n');
    await advance(2900);
    expect(cmds()).toHaveLength(1); // not before the retry gap

    await advance(200);
    expect(cmds()).toEqual(["cast 'bless'", "cast 'bless'"]);

    emit('game:affect-added', { n: 'Bless' });
    await done;
    await advance(20_000);
    expect(cmds()).toHaveLength(2); // the second cast took: nothing more is sent
    off();
  });

  it('gives up after three tries with one notice, and does not try a fourth time', async () => {
    const { cmds, off } = captureSends();
    const term = captureTerminal();
    const engine = makeEngine();
    const done = engine.execAction(SPELL, 1);
    await advance(30_000); // silence every time: 3 s window + 3 s gap, three times
    await done;
    off();
    term.off();
    expect(cmds()).toEqual(["cast 'bless'", "cast 'bless'", "cast 'bless'"]);
    expect(term.writes.filter((w) => w.includes('gave up on bless after 3 tries'))).toHaveLength(1);
  });

  it('with retry switched off it sends once and does not wait for an answer', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    await engine.execAction({ ...SPELL, retry: false }, 1); // resolves with no timer advance at all
    off();
    expect(cmds()).toEqual(["cast 'bless'"]);
  });

  it('a failure line that arrives when no cast is waiting is not attributed to anything', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    const done = engine.execAction(SPELL, 1);
    emit('game:affect-added', { n: 'bless' });
    await done;
    rawText('You lost your concentration.\r\n'); // the player's own cast, a moment later
    await advance(20_000);
    off();
    expect(cmds()).toEqual(["cast 'bless'"]);
  });

  it('a true-up that shows the affect during the gap cancels the retry (L14)', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    const done = engine.execAction(SPELL, 1);
    rawText('You lost your concentration.\r\n');
    await advance(1000);
    emit('game:affects-trueup', [{ n: 'bless' }]);
    await advance(5000);
    await done;
    off();
    expect(cmds()).toEqual(["cast 'bless'"]);
  });

  it('the retry gap is at least the ability\'s learned cooldown', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    engine.learnedCooldownSec.set("cast 'bless'", 8);
    const done = engine.execAction(SPELL, 1);
    rawText('You lost your concentration.\r\n');
    await advance(7500);
    expect(cmds()).toHaveLength(1);
    await advance(600);
    expect(cmds()).toHaveLength(2);
    emit('game:affect-added', { n: 'bless' });
    await done;
    off();
  });
});

describe('failures that retrying cannot fix (L17)', () => {
  it('no mana: not retried, one notice', async () => {
    const { cmds, off } = captureSends();
    const term = captureTerminal();
    const engine = makeEngine();
    const done = engine.execAction(SPELL, 1);
    rawText("You can't concentrate enough.\r\n");
    await done;
    await advance(20_000);
    off();
    term.off();
    expect(cmds()).toEqual(["cast 'bless'"]); // no second try, however long it waits
    expect(term.writes.filter((w) => w.includes('not enough mana for bless'))).toHaveLength(1);
  });

  it('an item that is gone: not retried, noted once, and not used again this run', async () => {
    const { cmds, off } = captureSends();
    const term = captureTerminal();
    const engine = makeEngine([{ affect: 'haste', cmd: 'quaff haste' }]);
    emit('game:affect-removed', { n: 'haste' });
    expect(cmds()).toEqual(['quaff haste']);
    rawText('You do not have that potion.\r\n');
    await advance(10_000);
    emit('game:affect-removed', { n: 'haste' });
    await advance(10_000);
    off();
    term.off();
    expect(cmds()).toEqual(['quaff haste']);
    expect(term.writes.filter((w) => w.includes('no item left'))).toHaveLength(1);
  });

  it('an attack spell cast out of a fight ("You aren\'t fighting anyone.") is not retried', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    const done = engine.execAction({ kind: 'if_affect_missing', affectName: 'x', cmd: "cast 'x'" }, 1);
    rawText("You aren't fighting anyone.\r\n");
    await done;
    await advance(20_000);
    off();
    expect(cmds()).toEqual(["cast 'x'"]);
  });
});

describe('affects dropping together are re-armed one at a time (L16)', () => {
  it('thirteen drops in one moment: the first is sent at once, the rest are serial and at least the gap apart', async () => {
    const { sent, off } = captureSends();
    const buffs: AutoLevelCriticalBuff[] = Array.from({ length: 13 }, (_, i) => ({ affect: `a${i}`, cmd: `quaff p${i}` }));
    const engine = makeEngine(buffs);
    for (let i = 0; i < 13; i++) emit('game:affect-removed', { n: `a${i}` });
    expect(sent.map((s) => s.cmd)).toEqual(['quaff p0']); // one in flight

    for (let i = 0; i < 13; i++) {
      emit('game:affect-added', { n: `a${i}` }); // the potion took
      await advance(1600);
    }
    off();
    expect(sent.map((s) => s.cmd)).toEqual(Array.from({ length: 13 }, (_, i) => `quaff p${i}`));
    for (let i = 1; i < sent.length; i++) expect(sent[i].at - sent[i - 1].at).toBeGreaterThanOrEqual(1500);
  });

  it('the same affect dropping twice is queued once', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine([{ affect: 'haste', cmd: 'quaff haste' }]);
    emit('game:affect-removed', { n: 'haste' });
    emit('game:affect-removed', { n: 'haste' });
    emit('game:affect-added', { n: 'haste' });
    await advance(10_000);
    off();
    expect(cmds()).toEqual(['quaff haste']);
  });

  it('a re-arm already queued for an affect keeps the post-fight recheck from casting it again', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine([{ affect: 'haste', cmd: 'quaff haste' }]);
    emit('game:affect-removed', { n: 'haste' }); // the potion is in flight
    await engine.execAction({ kind: 'if_affect_missing', affectName: 'haste', cmd: 'quaff haste' }, 1);
    off();
    expect(cmds()).toEqual(['quaff haste']);
  });
});

describe('item buffs are used whenever the affect drops (item 6)', () => {
  it('in a fight: the in-combat item; out of a fight: the buff item; a spell is left to the post-fight recheck', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine([
      { affect: 'haste', cmd: 'quaff haste' },
      { affect: 'sanctuary', cmd: "cast 'sanctuary'", inCombatCmd: 'quaff holy' },
      { affect: 'bless', cmd: "cast 'bless'" },
    ]);

    fight(true);
    emit('game:affect-removed', { n: 'haste' });
    emit('game:affect-removed', { n: 'sanctuary' });
    emit('game:affect-removed', { n: 'bless' }); // a spell: not recast in a fight
    emit('game:affect-added', { n: 'haste' });
    await advance(1600);
    emit('game:affect-added', { n: 'sanctuary' });
    await advance(1600);
    expect(cmds()).toEqual(['quaff haste', 'quaff holy']);

    fight(false);
    emit('game:affect-removed', { n: 'haste' }); // out of a fight an item is used at once
    emit('game:affect-removed', { n: 'sanctuary' }); // a spell waits for the recheck
    emit('game:affect-removed', { n: 'bless' });
    emit('game:affect-added', { n: 'haste' });
    await advance(5000);
    off();
    expect(cmds()).toEqual(['quaff haste', 'quaff holy', 'quaff haste']);
  });

  it('out of a fight with no run going, nothing is used on its own', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine([{ affect: 'haste', cmd: 'quaff haste' }]);
    engine.running = false;
    emit('game:affect-removed', { n: 'haste' });
    await advance(5000);
    off();
    expect(cmds()).toEqual([]);
  });

  it('a buff with a reaction cooldown is not re-armed again inside it (anti-flap), and is after it', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine([{ affect: 'haste', cmd: 'quaff haste', cooldownSec: 30 }]);
    emit('game:affect-removed', { n: 'haste' });
    emit('game:affect-added', { n: 'haste' });
    await advance(5000);
    emit('game:affect-removed', { n: 'haste' }); // flapping 5 s later: inside the 30 s
    await advance(5000);
    expect(cmds()).toEqual(['quaff haste']);

    await advance(30_000);
    emit('game:affect-removed', { n: 'haste' });
    off();
    expect(cmds()).toEqual(['quaff haste', 'quaff haste']);
  });

  it('a drop while holding near a level-up is ignored', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine([{ affect: 'haste', cmd: 'quaff haste', holdNearLevel: true }]);
    engine.estKillXp = 100;
    engine.lastTnl = 50;
    emit('game:affect-removed', { n: 'haste' });
    await advance(5000);
    off();
    expect(cmds()).toEqual([]);
  });

  it('an item that never confirms is not retried on silence (potions do not fizzle)', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine([{ affect: 'haste', cmd: 'quaff haste' }]);
    emit('game:affect-removed', { n: 'haste' });
    await advance(30_000);
    off();
    expect(cmds()).toEqual(['quaff haste']);
  });

  it('an in-combat command that still has a placeholder is refused once and the queue moves on', async () => {
    const { cmds, off } = captureSends();
    const term = captureTerminal();
    const engine = makeEngine([
      { affect: 'sanctuary', cmd: "cast 'sanctuary'", inCombatCmd: 'quaff <potion>' },
      { affect: 'haste', cmd: 'quaff haste' },
    ]);
    fight(true);
    emit('game:affect-removed', { n: 'sanctuary' });
    emit('game:affect-removed', { n: 'haste' });
    await advance(3000);
    off();
    term.off();
    expect(cmds()).toEqual(['quaff haste']);
    expect(term.writes.filter((w) => w.includes('not sent'))).toHaveLength(1);
  });
});

describe('pause freezes the queue, stop clears it (L18)', () => {
  it('a pause during the retry gap holds the retry; resume sends it after the remaining gap', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    const done = engine.execAction(SPELL, 1);
    rawText('You lost your concentration.\r\n');
    await advance(1000);
    engine.pause();
    await advance(8000);
    expect(cmds()).toHaveLength(1); // frozen
    engine.resume();
    await advance(2100);
    expect(cmds()).toHaveLength(2);
    emit('game:affect-added', { n: 'bless' });
    await done;
    off();
  });

  it('a pause before a queued re-arm holds it; on resume it is re-checked and skipped when the affect is back', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine([
      { affect: 'a', cmd: 'quaff a' },
      { affect: 'b', cmd: 'quaff b' },
    ]);
    emit('game:affect-removed', { n: 'a' });
    emit('game:affect-removed', { n: 'b' });
    emit('game:affect-added', { n: 'a' });
    engine.pause();
    await advance(6000);
    expect(cmds()).toEqual(['quaff a']);
    emit('game:affect-added', { n: 'b' }); // came back by itself while paused
    engine.resume();
    await advance(5000);
    off();
    expect(cmds()).toEqual(['quaff a']);
  });

  it('stop clears the queue: nothing more is sent', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine([
      { affect: 'a', cmd: 'quaff a' },
      { affect: 'b', cmd: 'quaff b' },
      { affect: 'c', cmd: 'quaff c' },
    ]);
    emit('game:affect-removed', { n: 'a' });
    emit('game:affect-removed', { n: 'b' });
    emit('game:affect-removed', { n: 'c' });
    engine.stop();
    await advance(20_000);
    off();
    expect(cmds()).toEqual(['quaff a']);
    expect(engine.rearmQueue).toEqual([]);
  });
});

describe('a heal that is only worth casting when hurt (item 12)', () => {
  const heal: AutoLevelAction = { kind: 'send', cmd: "cast 'dark heal'", combatState: 'out', vitalsGate: { stat: 'hp', op: 'below', pct: 70 } };
  const hp = (now: number) => emit('game:char-data', { is_fighting: false, hp: now, max_hp: 100 });

  it('casts again while hp is still under the gate, and stops once it is above', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    hp(40);
    const done = engine.execAction(heal, 1);
    expect(cmds()).toEqual(["cast 'dark heal'"]);

    rawText('A dark healing fills your body.\r\n');
    hp(55);
    await advance(1600);
    expect(cmds()).toEqual(["cast 'dark heal'", "cast 'dark heal'"]);

    rawText('A dark healing fills your body.\r\n');
    hp(85);
    await advance(1600);
    await done;
    off();
    expect(cmds()).toHaveLength(2);
  });

  it('retries a fizzled heal, and never casts it in a fight', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    hp(40);
    const done = engine.execAction(heal, 1);
    rawText('You lost your concentration.\r\n');
    await advance(3100);
    expect(cmds()).toEqual(["cast 'dark heal'", "cast 'dark heal'"]);
    rawText('A dark healing fills your body.\r\n');
    hp(90);
    await advance(1600);
    await done;

    fight(true);
    await engine.execAction(heal, 1);
    off();
    expect(cmds()).toHaveLength(2);
  });

  it('is bounded: a heal that works but never gets hp over the gate stops after five casts', async () => {
    const { cmds, off } = captureSends();
    const engine = makeEngine();
    hp(10);
    const done = engine.execAction(heal, 1);
    for (let i = 0; i < 8; i++) {
      rawText('A dark healing fills your body.\r\n');
      await advance(1600);
    }
    await done;
    off();
    expect(cmds()).toHaveLength(5);
  });
});

describe('subscriptions (EVENTBUS-01: one listener added, the wire command-sent signal that tells the player typing from the engine)', () => {
  it('bind() registers its listeners and no more', () => {
    const engine = makeEngine();
    expect(engine.offListeners).toHaveLength(12);
  });
});
