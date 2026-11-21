// apps/game-client/src/features/autoleveling/autoleveling-engine.gates.test.ts
//
// Combat-state and enemy-condition gates (live findings 2026-11-14, items 8, 9 and 12). The engine talks to the real window event
// bus (jsdom): tests drive it with CustomEvents and read commands off `shatteredarchive:send-command`.

import { AutoLevelingEngine } from './autoleveling-engine';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import type { AutoLevelAction, AutoLevelConfig } from './autoleveling-types';

const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));

function captureSends() {
  const sent: string[] = [];
  const listener = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { cmd?: unknown };
    if (d && typeof d.cmd === 'string') sent.push(d.cmd);
  };
  window.addEventListener('shatteredarchive:send-command', listener);
  return { sent, off: () => window.removeEventListener('shatteredarchive:send-command', listener) };
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
  // Tests poke private state and call private methods directly: `any` on purpose.
  return new AutoLevelingEngine({ getConfig: () => cfg, setRunState: () => {} }) as any;
}

const rawText = (text: string) => emit('shatteredarchive:raw-data', { text, rawText: text, fromUserScript: false });
const fight = (on: boolean) => emit('game:char-data', { is_fighting: on });
const track = (engine: any, lookName = 'A bear stands here.') => {
  engine.lastEncounterMatch = { targetCleanName: 'a bear', lookName, at: Date.now() };
};

describe('combat-state gate (L8)', () => {
  it('an out-of-combat-only row is sent when not fighting and skipped while fighting', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine(makeConfig());
    engine.bind();
    const act: AutoLevelAction = { kind: 'send', cmd: "cast 'cure light'", combatState: 'out' };

    fight(true);
    await engine.execAction(act, 1);
    expect(sent).toEqual([]);

    fight(false);
    await engine.execAction(act, 1);
    expect(sent).toEqual(["cast 'cure light'"]);
    off();
  });

  it('an in-combat-only row is the reverse', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine(makeConfig());
    engine.bind();
    const act: AutoLevelAction = { kind: 'send', cmd: 'bash', combatState: 'in' };

    await engine.execAction(act, 1);
    expect(sent).toEqual([]);
    fight(true);
    await engine.execAction(act, 1);
    expect(sent).toEqual(['bash']);
    off();
  });

  it('is read when the command is about to be sent, so a fight that starts in between drops it', async () => {
    const { sent, off } = captureSends();
    const cfg = makeConfig({ lookSettleMs: 60 });
    const engine = makeEngine(cfg);
    engine.bind();
    engine.cfg = cfg;
    const actions: AutoLevelAction[] = [
      { kind: 'send', cmd: 'cast one' },
      { kind: 'send', cmd: "cast 'cure light'", combatState: 'out' },
    ];
    const done = engine.runActions(actions, 'start.pre', 1);
    await waitFor(() => sent.includes('cast one'));
    fight(true); // a fight starts while the second buff waits out the settle
    await done;
    off();
    expect(sent).toEqual(['cast one']);
  });

  it('applies to every action kind that carries it', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine(makeConfig());
    engine.bind();
    fight(true);
    const kinds: AutoLevelAction[] = [
      { kind: 'send_cooldown', cmd: 'a', cooldownSec: 0, combatState: 'out' },
      { kind: 'if_affect_missing', affectName: 'bless', cmd: 'b', combatState: 'out' },
      { kind: 'send_every_ticks', cmd: 'c', everyTicks: 0, combatState: 'out' },
    ];
    for (const k of kinds) await engine.execAction(k, 1);
    off();
    expect(sent).toEqual([]);
  });
});

describe('enemy-condition gate (L9, L10, L11, L12)', () => {
  it('never blocks before any condition line has been seen', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine(makeConfig());
    engine.bind();
    track(engine);
    fight(true);
    await engine.execAction({ kind: 'send', cmd: 'backstab', enemyGate: { op: 'above', band: 30 } }, 1);
    await engine.execAction({ kind: 'send', cmd: 'finish', enemyGate: { op: 'below', band: 30 } }, 1);
    off();
    expect(sent).toEqual(['backstab', 'finish']);
  });

  it('follows the condition line: above only while the enemy is healthier, below only once it is hurt', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine(makeConfig());
    engine.bind();
    track(engine);
    fight(true);
    const above: AutoLevelAction = { kind: 'send', cmd: 'backstab', enemyGate: { op: 'above', band: 30 } };
    const below: AutoLevelAction = { kind: 'send', cmd: 'finish', enemyGate: { op: 'below', band: 30 } };

    rawText('A bear has quite a few wounds.\r\n'); // band 50
    await engine.execAction(above, 1);
    await engine.execAction(below, 1);
    expect(sent).toEqual(['backstab']);

    rawText('A bear has some big nasty wounds and scratches.\r\n'); // band 30: neither strictly above nor below 30
    await engine.execAction(above, 1);
    await engine.execAction(below, 1);
    expect(sent).toEqual(['backstab']);

    rawText('A bear looks pretty hurt.\r\n'); // band 15
    await engine.execAction(above, 1);
    await engine.execAction(below, 1);
    expect(sent).toEqual(['backstab', 'finish']);
    off();
  });

  it('a condition line about another creature (a pet) does not move the gate', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine(makeConfig());
    engine.bind();
    track(engine);
    fight(true);
    rawText('An unholy steed is in awful condition.\r\n');
    await engine.execAction({ kind: 'send', cmd: 'backstab', enemyGate: { op: 'above', band: 30 } }, 1);
    off();
    expect(sent).toEqual(['backstab']); // still unknown, so it does not block
    expect(engine.enemyBand).toBeNull();
  });

  it('reads a line inside colour codes; with no tracked target nothing is read', () => {
    const engine = makeEngine(makeConfig());
    engine.bind();
    fight(true);
    rawText('A bear has quite a few wounds.\r\n');
    expect(engine.enemyBand).toBeNull(); // no tracked target yet
    track(engine);
    rawText('\x1b[1;31mA bear has a few scratches.\x1b[0m\r\n');
    expect(engine.enemyBand).toBe(90);
  });

  it('ignores a condition seen while not fighting, and forgets the band when the fight ends and when the next one starts', () => {
    const engine = makeEngine(makeConfig());
    engine.bind();
    track(engine);
    rawText('A bear has a few scratches.\r\n'); // a plain look at the mob, not a fight
    expect(engine.enemyBand).toBeNull();
    fight(true);
    rawText('A bear has a few scratches.\r\n');
    expect(engine.enemyBand).toBe(90);
    fight(false);
    expect(engine.enemyBand).toBeNull();
    fight(true);
    expect(engine.enemyBand).toBeNull();
  });

  it('own vitals and the enemy gate must BOTH hold (two thresholds on one row)', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine(makeConfig());
    engine.bind();
    track(engine);
    emit('game:char-data', { is_fighting: true, hp: 80, max_hp: 100 });
    rawText('A bear looks pretty hurt.\r\n');
    const act: AutoLevelAction = {
      kind: 'send',
      cmd: 'bash',
      vitalsGate: { stat: 'hp', op: 'below', pct: 50 },
      enemyGate: { op: 'below', band: 30 },
    };
    await engine.execAction(act, 1);
    expect(sent).toEqual([]); // the enemy is hurt but my hp is 80%

    emit('game:char-data', { is_fighting: true, hp: 40, max_hp: 100 });
    await engine.execAction(act, 1);
    expect(sent).toEqual(['bash']);
    off();
  });
});

describe('a condition-gated heal between fights (item 12)', () => {
  const heal: AutoLevelAction = {
    kind: 'send',
    cmd: "cast 'cure light'",
    combatState: 'out',
    vitalsGate: { stat: 'hp', op: 'below', pct: 70 },
  };

  it('runs in the post-fight recheck when hurt and not at 90% hp; an ungated every-round buff still waits for the next round', async () => {
    const { sent, off } = captureSends();
    const base = createDefaultAutoLevelConfig().steps;
    const cfg = makeConfig({
      lookSettleMs: 0,
      steps: { ...base, start: { pre: [heal, { kind: 'send', cmd: 'every round buff' }], exec: [], post: [] } },
    });
    const engine = makeEngine(cfg);
    engine.bind();
    engine.cfg = cfg;

    emit('game:char-data', { is_fighting: false, hp: 90, max_hp: 100 });
    await engine.recheckBuffs(1, 'postFight.buffs');
    expect(sent).toEqual([]);

    emit('game:char-data', { is_fighting: false, hp: 40, max_hp: 100 });
    await engine.recheckBuffs(1, 'postFight.buffs');
    expect(sent).toEqual(["cast 'cure light'"]);
    off();
  });

  it('a plain send with no condition at all is not part of the recheck', async () => {
    const { sent, off } = captureSends();
    const base = createDefaultAutoLevelConfig().steps;
    const cfg = makeConfig({ lookSettleMs: 0, steps: { ...base, start: { pre: [{ kind: 'send', cmd: 'plain' }], exec: [], post: [] } } });
    const engine = makeEngine(cfg);
    engine.bind();
    engine.cfg = cfg;
    await engine.recheckBuffs(1, 'postFight.buffs');
    off();
    expect(sent).toEqual([]);
  });

  it('is in fact refused while a fight is on, because the heal is out-of-combat only', async () => {
    const { sent, off } = captureSends();
    const engine = makeEngine(makeConfig());
    engine.bind();
    emit('game:char-data', { is_fighting: true, hp: 10, max_hp: 100 });
    await engine.execAction(heal, 1);
    off();
    expect(sent).toEqual([]);
  });
});
