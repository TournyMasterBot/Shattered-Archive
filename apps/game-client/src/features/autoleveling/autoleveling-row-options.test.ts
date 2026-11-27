// apps/game-client/src/features/autoleveling/autoleveling-row-options.test.ts
//
// The options added to buff and fight rows on 2026-11-18 (combat state, enemy gate, retry switch): stored, read back, validated on
// the way in from the cloud, carried to the engine's actions, and kept when a buff row changes its recast mode.

import type { AutoPilotArea } from './autoleveling-content-types';
import { memoryKvStore } from './autoleveling-idb';
import {
  __setUserDataStoreForTests,
  exportAll,
  getBuffOverlay,
  getFightOverlay,
  importRecords,
  normalizeRecord,
  setBuffOverlay,
  setFightOverlay,
  type BuffRow,
} from './autoleveling-user-data';
import { DEFAULT_REFRESH_TICKS, buffRowForGate } from './autoleveling-class-defaults';
import { draftToConfig, type ConfigDraft } from './autoleveling-wizard-config';

const fullBuff = {
  label: 'Haste',
  cmd: "cast 'haste'",
  affect: 'haste',
  combatState: 'out' as const,
  enemyGate: { op: 'below' as const, band: 50 as const },
  retryUntilSet: false as const,
};

describe('storing and reading the new row options (L7)', () => {
  it('buff rows keep the new fields through a save and a read', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await setBuffOverlay('area-a', [fullBuff]);
    expect(await getBuffOverlay('area-a')).toEqual([fullBuff]);
  });

  it('fight rows keep the new fields through a save and a read', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    const row = { cmd: 'kick', cooldownSec: 2, combatState: 'in' as const, enemyGate: { op: 'above' as const, band: 30 as const } };
    await setFightOverlay('area-a', 'Warrior', [row]);
    expect(await getFightOverlay('area-a', 'Warrior')).toEqual([row]);
  });

  it('a cloud import keeps the valid options on a row and exports them again', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await importRecords([{ id: 'buff:area-a', kind: 'buff', areaSlug: 'area-a', data: [fullBuff], updatedAt: 5 }]);
    const exported = (await exportAll()).find((r) => r.id === 'buff:area-a');
    expect(exported?.data).toEqual([fullBuff]);
  });
});

describe('what arrives from the cloud is checked field by field (L27)', () => {
  it('drops an unknown value from the row but keeps the row and its other fields', () => {
    const rec = normalizeRecord({
      id: 'fight:a:warrior',
      kind: 'fight',
      areaSlug: 'a',
      className: 'warrior',
      updatedAt: 1,
      data: [
        {
          cmd: 'kick',
          cooldownSec: 1,
          combatState: 'sideways',
          enemyGate: { op: 'above', band: 42 },
          retryUntilSet: 'no',
          vitalsGate: { stat: 'hp', op: 'below', pct: 40 },
        },
        { cmd: 'bash', cooldownSec: 0, enemyGate: { op: 'near', band: 50 } },
        { cmd: 'trip', cooldownSec: 0, enemyGate: 'low' },
      ],
    });
    expect(rec?.data).toEqual([
      { cmd: 'kick', cooldownSec: 1, vitalsGate: { stat: 'hp', op: 'below', pct: 40 } },
      { cmd: 'bash', cooldownSec: 0 },
      { cmd: 'trip', cooldownSec: 0 },
    ]);
  });

  it('retryUntilSet is only ever stored as false: true is the default and is dropped (SETTINGS-01)', () => {
    const rec = normalizeRecord({ id: 'buff:a', kind: 'buff', areaSlug: 'a', updatedAt: 1, data: [{ label: 'x', cmd: 'y', retryUntilSet: true }] });
    expect(rec?.data).toEqual([{ label: 'x', cmd: 'y' }]);
  });

  it('every band floor and both directions are accepted', () => {
    for (const band of [0, 15, 30, 50, 75, 90, 100]) {
      for (const op of ['above', 'below'] as const) {
        const rec = normalizeRecord({ id: 'b', kind: 'buff', areaSlug: 'a', updatedAt: 1, data: [{ label: 'x', cmd: 'y', enemyGate: { op, band } }] });
        expect(rec?.data).toEqual([{ label: 'x', cmd: 'y', enemyGate: { op, band } }]);
      }
    }
  });

  it('does not mutate the record it was given, and passes odd shapes through untouched', () => {
    const input = { id: 'buff:a', kind: 'buff', areaSlug: 'a', updatedAt: 1, data: [{ label: 'x', cmd: 'y', combatState: 'bad' }] };
    const copy = JSON.parse(JSON.stringify(input));
    normalizeRecord(input);
    expect(input).toEqual(copy);
    expect(normalizeRecord({ id: 'buff:b', kind: 'buff', areaSlug: 'a', updatedAt: 1, data: { not: 'an array' } })?.data).toEqual({ not: 'an array' });
    expect(normalizeRecord({ id: 'buff:c', kind: 'buff', areaSlug: 'a', updatedAt: 1, data: [null, 'text', 3, [1]] })?.data).toEqual([null, 'text', 3, [1]]);
  });
});

describe('buffRowForGate keeps every field that is not specific to the old mode (L6, SETTINGS-07)', () => {
  // Typed Required<BuffRow> on purpose: a field added to BuffRow without being listed here is a compile error, so the
  // per-field survival check below can never silently skip a new field.
  const FULL: Required<BuffRow> = {
    label: 'Haste',
    cmd: "cast 'haste'",
    affect: 'haste',
    refreshTicks: 7,
    inCombatCmd: 'quaff haste',
    holdNearLevel: true,
    disabled: true,
    unverified: true,
    vitalsGate: { stat: 'mp', op: 'above', pct: 30 },
    onceKey: 'fight',
    combatState: 'out',
    enemyGate: { op: 'below', band: 50 },
    retryUntilSet: false,
  };
  const MODE_FIELDS = ['affect', 'refreshTicks', 'inCombatCmd', 'holdNearLevel'] as const;
  const COMMON = (Object.keys(FULL) as (keyof BuffRow)[]).filter((k) => !(MODE_FIELDS as readonly string[]).includes(k));

  it('there are common fields to check', () => {
    expect(COMMON.length).toBe(9);
  });

  it.each([
    ['affect', 'ticks'],
    ['affect', 'always'],
    ['ticks', 'affect'],
    ['ticks', 'always'],
    ['always', 'affect'],
    ['always', 'ticks'],
  ] as const)('%s to %s: every common field survives', (_from, to) => {
    const result = buffRowForGate(FULL, to);
    for (const key of COMMON) expect(result[key]).toEqual(FULL[key]);
  });

  it('survives a round trip through every mode', () => {
    const back = buffRowForGate(buffRowForGate(buffRowForGate(FULL, 'ticks'), 'always'), 'affect');
    for (const key of COMMON) expect(back[key]).toEqual(FULL[key]);
    expect(back.affect).toBe(''); // the affect name belongs to the affect mode and is not remembered across other modes (as before)
  });

  it('keeps the affect extras only in affect mode, and the tick count only in ticks mode', () => {
    expect(buffRowForGate(FULL, 'affect')).toMatchObject({ affect: 'haste', inCombatCmd: 'quaff haste', holdNearLevel: true });
    expect(buffRowForGate(FULL, 'affect')).not.toHaveProperty('refreshTicks');
    const ticks = buffRowForGate(FULL, 'ticks');
    expect(ticks.refreshTicks).toBe(7);
    for (const k of ['affect', 'inCombatCmd', 'holdNearLevel'] as const) expect(ticks).not.toHaveProperty(k);
    const always = buffRowForGate(FULL, 'always');
    for (const k of MODE_FIELDS) expect(always).not.toHaveProperty(k);
  });

  it('gives a fresh tick row the default count and an affect row an empty affect name', () => {
    expect(buffRowForGate({ label: 'x', cmd: 'y' }, 'ticks').refreshTicks).toBe(DEFAULT_REFRESH_TICKS);
    expect(buffRowForGate({ label: 'x', cmd: 'y' }, 'affect')).toEqual({ label: 'x', cmd: 'y', affect: '' });
  });

  it('does not mutate the row it was given', () => {
    const copy = JSON.parse(JSON.stringify(FULL));
    buffRowForGate(FULL, 'always');
    expect(FULL).toEqual(copy);
  });
});

describe('the wizard config carries the options to the engine actions', () => {
  const area: AutoPilotArea = {
    slug: 'a',
    areaName: 'Area A',
    continent: 'Arkania',
    areaId: 'AreaA',
    levelRange: [1, 10],
    startRoom: 'A gate',
    speedwalkToStart: '',
    requiredActions: [],
    dirs: ['n'],
    notes: '',
    isExcellentLevelingArea: false,
    recommendedTargets: [],
  };
  const draft = (over: Partial<ConfigDraft>): ConfigDraft => ({
    area,
    targets: [],
    mode: 'auto_level',
    loopRounds: true,
    initiationCommand: '',
    buffs: [],
    fightCommands: [],
    ...over,
  });

  it('an affect buff carries its combat state, enemy gate and a switched-off retry', () => {
    const cfg = draftToConfig(draft({ buffs: [fullBuff] }));
    expect(cfg.steps.start.pre).toEqual([
      expect.objectContaining({
        kind: 'if_affect_missing',
        affectName: 'haste',
        combatState: 'out',
        enemyGate: { op: 'below', band: 50 },
        retry: false,
      }),
    ]);
  });

  it('a row without the options produces an action without the keys', () => {
    const cfg = draftToConfig(draft({ buffs: [{ label: 'Armor', cmd: "cast 'armor'", affect: 'armor' }], fightCommands: [{ cmd: 'kick', cooldownSec: 0 }] }));
    for (const a of [...cfg.steps.start.pre, ...cfg.steps.fight.exec]) {
      expect(a).not.toHaveProperty('combatState');
      expect(a).not.toHaveProperty('enemyGate');
      expect(a).not.toHaveProperty('retry');
    }
  });

  it('tick and plain buffs and both fight kinds carry the gates', () => {
    const gates = { combatState: 'in' as const, enemyGate: { op: 'above' as const, band: 15 as const } };
    const cfg = draftToConfig(
      draft({
        buffs: [
          { label: 'Berserk', cmd: 'berserk', refreshTicks: 3, ...gates },
          { label: 'Dark Heal', cmd: "cast 'dark heal'", ...gates },
        ],
        fightCommands: [
          { cmd: 'kick', cooldownSec: 0, ...gates },
          { cmd: 'bash', cooldownSec: 4, ...gates },
        ],
      }),
    );
    const all = [...cfg.steps.start.pre, ...cfg.steps.fight.exec];
    expect(all.map((a) => a.kind)).toEqual(['send_every_ticks', 'send', 'send', 'send_cooldown']);
    for (const a of all) expect(a).toMatchObject(gates);
  });

  it('a critical buff carries a switched-off retry', () => {
    const cfg = draftToConfig(draft({ buffs: [{ ...fullBuff, inCombatCmd: 'quaff haste' }] }));
    expect(cfg.criticalBuffs).toEqual([expect.objectContaining({ affect: 'haste', inCombatCmd: 'quaff haste', retry: false })]);
  });
});
