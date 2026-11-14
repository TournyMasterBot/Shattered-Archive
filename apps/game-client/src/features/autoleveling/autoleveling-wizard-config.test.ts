// apps/game-client/src/features/autoleveling/autoleveling-wizard-config.test.ts

import type { AutoPilotArea } from './autoleveling-content-types';
import { draftToConfig, type ConfigDraft } from './autoleveling-wizard-config';
import { migrateAutoLevelConfigV2ToV3 } from './autoleveling-normalize';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';

const centaurVillage: AutoPilotArea = {
  slug: 'centaur-village',
  areaName: 'Centaur Village',
  continent: 'Arkania',
  areaId: 'CentaurVillage',
  levelRange: [10, 20],
  startRoom: 'The village gate',
  speedwalkToStart: 'recall;s;s;w',
  requiredActions: ['open gate'],
  dirs: ['n', 'e', 'kill;s'],
  notes: '',
  isExcellentLevelingArea: true,
  recommendedTargets: [],
};

function baseDraft(overrides: Partial<ConfigDraft> = {}): ConfigDraft {
  return {
    area: centaurVillage,
    targets: [
      { lookName: 'A centaur ranger eyes you.', engageName: 'ranger', level: 14, enabled: true },
      { lookName: 'A centaur filly grazes here.', engageName: 'filly', level: 11, enabled: true },
      { lookName: 'A lone centaur scout watches.', engageName: 'scout', enabled: true },
    ],
    mode: 'auto_level',
    loopRounds: true,
    initiationCommand: '',
    buffs: [
      { label: 'Sanctuary', cmd: "cast 'sanctuary'", affect: 'sanctuary', inCombatCmd: 'quaff divine' },
      { label: 'Haste', cmd: "cast 'haste'", affect: 'haste', holdNearLevel: true },
      { label: 'Berserk', cmd: 'berserk', refreshTicks: 6 },
    ],
    fightCommands: [
      { cmd: 'bash', cooldownSec: 8 },
      { cmd: 'kick', cooldownSec: 0 },
    ],
    ...overrides,
  };
}

describe('draftToConfig', () => {
  it('produces a runnable v3 config', () => {
    const cfg = draftToConfig(baseDraft());
    expect(cfg.version).toBe(3);
    expect(cfg.mode).toBe('auto_level');
    expect(cfg.loopRounds).toBe(true);
    expect(cfg.roundLoopTimeMs).toBe(3_000); // active-leveling pace, not the 5-min sightsee default
  });

  it('joins required actions + dirs into init.trainingPath, skipping speedwalkToStart for now', () => {
    const cfg = draftToConfig(baseDraft());
    expect(cfg.init.trainingPath).toBe('open gate;n;e;kill;s');
    expect(cfg.init.areaName).toBe('Centaur Village');
    expect(cfg.init.areaId).toBe('CentaurVillage');
  });

  it('maps enabled targets (area + custom) to AutoLevelTarget rows', () => {
    const cfg = draftToConfig(baseDraft());
    expect(cfg.init.targets).toHaveLength(3);
    expect(cfg.init.targets[0]).toEqual({
      cleanName: 'a centaur ranger eyes you',
      name: 'A centaur ranger eyes you.',
      lookName: 'A centaur ranger eyes you.',
      keywords: ['ranger'],
      level: 14,
    });
    // no level on the custom one
    expect(cfg.init.targets[2]).toEqual({
      cleanName: 'a lone centaur scout watches',
      name: 'A lone centaur scout watches.',
      lookName: 'A lone centaur scout watches.',
      keywords: ['scout'],
    });
  });

  it('drops disabled targets', () => {
    const draft = baseDraft();
    draft.targets[1].enabled = false;
    const cfg = draftToConfig(draft);
    expect(cfg.init.targets.map((t) => t.keywords[0])).toEqual(['ranger', 'scout']);
  });

  it('a paused (disabled) fight command stays in the draft but never reaches the engine; the others keep their order', () => {
    const draft = baseDraft({
      fightCommands: [
        { cmd: 'bash', cooldownSec: 8 },
        { cmd: 'kick', cooldownSec: 0, disabled: true },
        { cmd: 'trip', cooldownSec: 4 },
      ],
    });
    const cfg = draftToConfig(draft);
    expect(cfg.steps.fight.exec.map((a: any) => a.cmd)).toEqual(['bash', 'trip']);
    expect(draft.fightCommands).toHaveLength(3); // nothing was removed
  });

  it('a paused buff stays in the draft but reaches neither the pre-round actions nor the critical buffs', () => {
    const draft = baseDraft({
      buffs: [
        { label: 'Sanctuary', cmd: "cast 'sanctuary'", affect: 'sanctuary', inCombatCmd: 'quaff divine', disabled: true },
        { label: 'Armor', cmd: "cast 'armor'", affect: 'armor' },
        { label: 'Haste', cmd: "cast 'haste'", affect: 'haste', holdNearLevel: true, disabled: true },
      ],
    });
    const cfg = draftToConfig(draft);
    expect(cfg.steps.start.pre.map((a: any) => a.cmd)).toEqual(["cast 'armor'"]);
    expect(cfg.criticalBuffs).toEqual([]);
    expect(draft.buffs).toHaveLength(3);
  });

  it('every fight command paused leaves no fight actions (autopilot just auto-attacks)', () => {
    const cfg = draftToConfig(baseDraft({ fightCommands: [{ cmd: 'bash', cooldownSec: 8, disabled: true }] }));
    expect(cfg.steps.fight.exec).toEqual([]);
  });

  it('an edited pre-loaded target reaches the engine with its edited room line and keyword (personal override)', () => {
    const draft = baseDraft();
    draft.targets[0] = {
      ...draft.targets[0],
      lookName: 'A tall centaur ranger eyes you.',
      engageName: 'rng',
    };
    const cfg = draftToConfig(draft);
    expect(cfg.init.targets[0]).toMatchObject({ lookName: 'A tall centaur ranger eyes you.', keywords: ['rng'] });
  });

  it('maps each buff to its start-step action by gate', () => {
    const cfg = draftToConfig(baseDraft());
    expect(cfg.steps.start.pre).toEqual([
      { kind: 'if_affect_missing', affectName: 'sanctuary', cmd: "cast 'sanctuary'" },
      { kind: 'if_affect_missing', affectName: 'haste', cmd: "cast 'haste'" },
      { kind: 'send_every_ticks', cmd: 'berserk', everyTicks: 6 },
    ]);
  });

  it('emits criticalBuffs only for affect-gated rows with an in-combat action or hold flag', () => {
    const cfg = draftToConfig(baseDraft());
    expect(cfg.criticalBuffs).toEqual([
      { affect: 'sanctuary', cmd: "cast 'sanctuary'", inCombatCmd: 'quaff divine' },
      { affect: 'haste', cmd: "cast 'haste'", holdNearLevel: true },
    ]);
  });

  it('maps fight commands to send_cooldown / send', () => {
    const cfg = draftToConfig(baseDraft());
    expect(cfg.steps.fight.exec).toEqual([
      { kind: 'send_cooldown', cmd: 'bash', cooldownSec: 8 },
      { kind: 'send', cmd: 'kick' },
    ]);
  });

  it('defaults the engage command to null (engine falls back to "kill {name}")', () => {
    expect(draftToConfig(baseDraft()).init.initiationCommand).toBeNull();
    expect(draftToConfig(baseDraft({ initiationCommand: '  cast fireball {name} ' })).init.initiationCommand).toBe(
      'cast fireball {name}',
    );
  });

  it('adds a look to steps.identify so multi-mob rooms clear', () => {
    expect(draftToConfig(baseDraft()).steps.identify.exec).toEqual([{ kind: 'send', cmd: 'look' }]);
  });

  it('carries a non-neutral player alignment through to the config, omits neutral', () => {
    expect(draftToConfig(baseDraft()).playerAlignment).toBeUndefined();
    expect(draftToConfig(baseDraft({ playerAlignment: 'evil' })).playerAlignment).toBe('evil');
    expect(draftToConfig(baseDraft({ playerAlignment: 'neutral' })).playerAlignment).toBeUndefined();
    // the mob's alignment is engine-detected, never set from the wizard
    expect(draftToConfig(baseDraft({ playerAlignment: 'evil' })).targetAlignment).toBeUndefined();
  });

  it('keeps the 5-minute round pause for sightsee mode', () => {
    expect(draftToConfig(baseDraft({ mode: 'sightsee' })).roundLoopTimeMs).toBe(
      createDefaultAutoLevelConfig().roundLoopTimeMs,
    );
  });

  it('a null area yields an empty route (engine will refuse to start)', () => {
    const cfg = draftToConfig(baseDraft({ area: null }));
    expect(cfg.init.trainingPath).toBeNull();
  });

  it('a buff with no affect and no tick gate becomes a plain send every round; weight commands undefined means no weight actions', () => {
    const cfg = draftToConfig(
      baseDraft({ buffs: [{ label: 'Bless', cmd: 'cast bless' }], weightCommands: undefined, weightAtOrAbovePct: undefined } as never),
    );
    expect(cfg.steps.start.pre).toEqual([{ kind: 'send', cmd: 'cast bless', vitalsGate: undefined, onceKey: undefined }]);
    expect(cfg.weight.commands).toEqual([]);
  });

  it('an area whose route is empty also yields a null route, not an empty string', () => {
    const cfg = draftToConfig(baseDraft({ area: { ...centaurVillage, requiredActions: [], dirs: [] } }));
    expect(cfg.init.trainingPath).toBeNull();
  });

  it('a draft with no mode runs auto-level, and missing rest commands mean no rest actions', () => {
    const cfg = draftToConfig(baseDraft({ mode: undefined as never, restStartOfRound: undefined, restEndOfRound: undefined }));
    expect(cfg.mode).toBe('auto_level');
    expect(cfg.rest.startOfRound).toEqual([]);
    expect(cfg.rest.endOfRound).toEqual([]);
  });
});

describe('migrateAutoLevelConfigV2ToV3', () => {
  it('carries a v2 config forward with version 3 + empty criticalBuffs', () => {
    const v2 = {
      ...createDefaultAutoLevelConfig(),
      version: 2,
      mode: 'auto_level' as const,
      roundLoopTimeMs: 12_345,
      init: { ...createDefaultAutoLevelConfig().init, trainingPath: 'n;n;e', areaName: 'Somewhere' },
    };
    delete (v2 as any).criticalBuffs;

    const v3 = migrateAutoLevelConfigV2ToV3(v2 as any);
    expect(v3.version).toBe(3);
    expect(v3.criticalBuffs).toEqual([]);
    expect(v3.mode).toBe('auto_level');
    expect(v3.roundLoopTimeMs).toBe(12_345);
    expect(v3.init.trainingPath).toBe('n;n;e');
    expect(v3.init.areaName).toBe('Somewhere');
  });
});
