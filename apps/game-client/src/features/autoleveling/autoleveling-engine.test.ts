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
    emit('game:room-data', { name: 'Some Room' });
    await done;
    off();

    const order = sent.filter((c) => c.startsWith('MARK_') || c === 'n');
    expect(order).toEqual(['MARK_START', 'MARK_MOVEPRE', 'n', 'MARK_MOVEPOST', 'MARK_RESET']);
  }, 10000);
});

describe('if_affect_missing gating', () => {
  it('skips the cast while the affect is live, sends it when absent', async () => {
    const { sent, off } = captureSends();
    const { engine } = makeEngine(makeConfig());
    engine.bind();

    emit('game:affects-trueup', [{ n: 'sanctuary' }]);
    await engine.execAction({ kind: 'if_affect_missing', affectName: 'sanctuary', cmd: "cast 'sanctuary'" }, 1);
    expect(sent).not.toContain("cast 'sanctuary'");

    emit('game:affect-removed', { n: 'sanctuary' });
    await engine.execAction({ kind: 'if_affect_missing', affectName: 'sanctuary', cmd: "cast 'sanctuary'" }, 1);
    expect(sent).toContain("cast 'sanctuary'");
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
            { kind: 'if_affect_missing', affectName: 'sanctuary', cmd: "cast 'sanctuary'" },
            { kind: 'if_affect_missing', affectName: 'armor', cmd: "cast 'armor'" },
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

    await engine.execAction({ kind: 'if_affect_missing', affectName: 'haste', cmd: "cast 'haste'" }, 1);
    expect(sent).not.toContain("cast 'haste'");

    // a non-held buff is unaffected
    await engine.execAction({ kind: 'if_affect_missing', affectName: 'sanctuary', cmd: "cast 'sanctuary'" }, 1);
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
