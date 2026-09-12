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
