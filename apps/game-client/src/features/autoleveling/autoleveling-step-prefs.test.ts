// apps/game-client/src/features/autoleveling/autoleveling-step-prefs.test.ts
//
// What the Rest step, the Weight step and the wait between laps remember, and which targets the player unticked (live findings
// 2026-11-14, item 4; L26-L29).

import { memoryKvStore } from './autoleveling-idb';
import {
  MAX_DESELECTED,
  MAX_REST_RULES,
  MAX_STEP_TEXT,
  STEP_DEFAULTS,
  normalizeDeselected,
  normalizeStepPrefs,
  stepPrefsFrom,
  stepValuesFrom,
  type StepValues,
} from './autoleveling-step-prefs';
import {
  __setUserDataStoreForTests,
  exportAll,
  getPrefs,
  getStepValues,
  getTargetSelection,
  importRecords,
  normalizeRecord,
  saveStepValues,
  setPrefs,
  setTargetSelection,
} from './autoleveling-user-data';

const changed: StepValues = {
  restStartOfRound: 'wake;stand',
  restEndOfRound: 'rest cot',
  restDuringRound: [{ hp: 40, mp: 30, recoverTo: { hp: 90, mp: 80 } }],
  weightAtOrAbovePct: 80,
  weightCommands: 'drop gold;drop silver',
  lapWaitMin: 5,
};

describe('normalizeStepPrefs (L26, L27)', () => {
  it('keeps valid values', () => {
    const prefs = stepPrefsFrom(changed);
    expect(normalizeStepPrefs(prefs)).toEqual(prefs);
  });

  it('drops a non-string, an oversized text, a bad percent and a bad lap wait, each to the default', () => {
    const v = stepValuesFrom(
      normalizeStepPrefs({
        rest: { startOfRound: 5, endOfRound: 'x'.repeat(MAX_STEP_TEXT + 1) },
        weight: { atOrAbovePct: 150, commands: { a: 1 } },
        lapWaitMin: 0,
      }),
    );
    expect(v).toEqual(STEP_DEFAULTS);
    expect(stepValuesFrom(normalizeStepPrefs({ weight: { atOrAbovePct: 55.5 }, lapWaitMin: 61 }))).toEqual(STEP_DEFAULTS);
    expect(stepValuesFrom(normalizeStepPrefs({ lapWaitMin: 'three' }))).toEqual(STEP_DEFAULTS);
  });

  it('accepts the edges: text at the cap, 1 and 100 percent, 1 and 60 minutes', () => {
    const edge = normalizeStepPrefs({ rest: { startOfRound: 'x'.repeat(MAX_STEP_TEXT) }, weight: { atOrAbovePct: 1 }, lapWaitMin: 1 });
    expect(edge.rest?.startOfRound).toHaveLength(MAX_STEP_TEXT);
    expect(edge.weight?.atOrAbovePct).toBe(1);
    expect(edge.lapWaitMin).toBe(1);
    expect(normalizeStepPrefs({ weight: { atOrAbovePct: 100 }, lapWaitMin: 60 })).toEqual({ weight: { atOrAbovePct: 100 }, lapWaitMin: 60 });
  });

  it('cleans each during-round rule: known fields only, whole percents 0-100, a non-object is no rule, at most the cap', () => {
    const rules = [
      { hp: 40, mp: 120, mv: 2.5, extra: 'x', recoverTo: { hp: 90, mp: -1, sp: 3 } },
      'nope',
      null,
      { recoverTo: 'bad' },
    ];
    expect(normalizeStepPrefs({ rest: { duringRound: rules } }).rest?.duringRound).toEqual([
      { hp: 40, recoverTo: { hp: 90 } },
      { recoverTo: {} },
    ]);
    const many = Array.from({ length: MAX_REST_RULES + 5 }, () => ({ hp: 10, recoverTo: {} }));
    expect(normalizeStepPrefs({ rest: { duringRound: many } }).rest?.duringRound).toHaveLength(MAX_REST_RULES);
  });

  it('gives nothing for non-object input and does not change what it was given', () => {
    for (const bad of [null, undefined, 'x', 5, [], { rest: 'x', weight: [], lapWaitMin: {} }]) expect(normalizeStepPrefs(bad)).toEqual({});
    const input = { rest: { startOfRound: 'a', duringRound: [{ hp: 5, recoverTo: {} }] }, lapWaitMin: 4 };
    const copy = JSON.parse(JSON.stringify(input));
    normalizeStepPrefs(input);
    expect(input).toEqual(copy);
  });
});

describe('stepValuesFrom and stepPrefsFrom (L26, SETTINGS-01/02)', () => {
  it('nothing stored means the defaults, and the defaults store nothing', () => {
    expect(stepValuesFrom(null)).toEqual(STEP_DEFAULTS);
    expect(stepValuesFrom({})).toEqual(STEP_DEFAULTS);
    expect(stepPrefsFrom(STEP_DEFAULTS)).toEqual({});
  });

  it('stores only what differs: one changed field leaves the rest out', () => {
    expect(stepPrefsFrom({ ...STEP_DEFAULTS, lapWaitMin: 7 })).toEqual({ lapWaitMin: 7 });
    expect(stepPrefsFrom({ ...STEP_DEFAULTS, weightAtOrAbovePct: 70 })).toEqual({ weight: { atOrAbovePct: 70 } });
    expect(stepPrefsFrom({ ...STEP_DEFAULTS, restEndOfRound: 'sleep' })).toEqual({ rest: { endOfRound: 'sleep' } });
  });

  it('changing a value back to its default stores nothing for it', () => {
    expect(stepPrefsFrom({ ...changed, lapWaitMin: 3, weightAtOrAbovePct: 90 })).toEqual({
      rest: stepPrefsFrom(changed).rest,
      weight: { commands: 'drop gold;drop silver' },
    });
  });

  it('compares strictly: 3 minutes is the default, "3" (a string that slipped in) and 3.0001 are not accepted at all', () => {
    expect(stepPrefsFrom({ ...STEP_DEFAULTS, lapWaitMin: 3 })).toEqual({});
    expect(stepPrefsFrom({ ...STEP_DEFAULTS, lapWaitMin: '3' as unknown as number })).toEqual({});
    expect(stepPrefsFrom({ ...STEP_DEFAULTS, lapWaitMin: 3.0001 })).toEqual({});
  });

  it('an empty rule list is the default; any rule is stored, whatever order its keys were written in', () => {
    expect(stepPrefsFrom({ ...STEP_DEFAULTS, restDuringRound: [] })).toEqual({});
    const a = { ...STEP_DEFAULTS, restDuringRound: [{ hp: 10, mp: 20, recoverTo: { hp: 80 } }] };
    const b = { ...STEP_DEFAULTS, restDuringRound: [{ mp: 20, hp: 10, recoverTo: { hp: 80 } }] };
    expect(stepPrefsFrom(a)).toEqual(stepPrefsFrom(b));
    expect(stepPrefsFrom(a).rest?.duringRound).toEqual([{ hp: 10, mp: 20, recoverTo: { hp: 80 } }]);
  });

  it('a value that cannot be stored (too long) falls back to the default instead of being stored', () => {
    expect(stepPrefsFrom({ ...STEP_DEFAULTS, restStartOfRound: 'x'.repeat(MAX_STEP_TEXT + 1) })).toEqual({});
  });

  it('round trips every field', () => {
    expect(stepValuesFrom(stepPrefsFrom(changed))).toEqual(changed);
  });
});

describe('normalizeDeselected', () => {
  it('keeps short unique ids in order and drops the rest', () => {
    expect(normalizeDeselected({ deselected: ['a:x', 'c:1', 'a:x', '', 5, 'y'.repeat(201)] })).toEqual(['a:x', 'c:1']);
  });

  it('is null when the data is not a selection, and caps the list', () => {
    for (const bad of [null, undefined, 'x', [], {}, { deselected: 'a' }]) expect(normalizeDeselected(bad)).toBeNull();
    const ids = Array.from({ length: MAX_DESELECTED + 10 }, (_, i) => `a:${i}`);
    expect(normalizeDeselected({ deselected: ids })).toHaveLength(MAX_DESELECTED);
  });
});

describe('the step values in storage (L26, L27, L28)', () => {
  beforeEach(() => __setUserDataStoreForTests(memoryKvStore()));

  it('start with the defaults and remember what was saved', async () => {
    expect(await getStepValues()).toEqual(STEP_DEFAULTS);
    await saveStepValues(changed);
    expect(await getStepValues()).toEqual(changed);
  });

  it('saving the defaults leaves no record behind, and clearing a value deletes it (L28: emptied stays empty)', async () => {
    await saveStepValues(STEP_DEFAULTS);
    expect((await exportAll()).filter((r) => r.kind === 'pref')).toEqual([]);

    await saveStepValues(changed);
    await saveStepValues({ ...changed, restStartOfRound: '', restEndOfRound: '' });
    const v = await getStepValues();
    expect(v.restStartOfRound).toBe('');
    expect(v.restEndOfRound).toBe('');
    expect(v.weightCommands).toBe('drop gold;drop silver');

    await saveStepValues(STEP_DEFAULTS);
    expect((await exportAll()).filter((r) => r.kind === 'pref')).toEqual([]);
  });

  it('keep the remembered class and alignment, and the class writes keep the step values', async () => {
    await setPrefs({ playerClass: 'Warrior', playerAlignment: 'good' });
    await saveStepValues(changed);
    expect(await getPrefs()).toMatchObject({ playerClass: 'Warrior', playerAlignment: 'good', lapWaitMin: 5 });
    await setPrefs({ playerClass: 'Mage' });
    expect(await getStepValues()).toEqual(changed);
    await saveStepValues(STEP_DEFAULTS);
    expect(await getPrefs()).toEqual({ playerClass: 'Mage', playerAlignment: 'good' });
  });

  it('a stored value that is invalid reads as the default', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await importRecords([{ id: 'pref:global', kind: 'pref', data: { playerClass: 'Warrior', lapWaitMin: 999, weight: { commands: 7 } }, updatedAt: 1 }]);
    expect(await getStepValues()).toEqual(STEP_DEFAULTS);
    expect((await getPrefs()).playerClass).toBe('Warrior');
  });

  it('a cloud import of the global record is cleaned by the same rules (L27, SETTINGS-04)', () => {
    const rec = normalizeRecord({
      id: 'pref:global',
      kind: 'pref',
      updatedAt: 1,
      data: { playerClass: 'Mage', rest: { startOfRound: 'wake', endOfRound: 4 }, lapWaitMin: 'x', other: 'kept' },
    });
    expect(rec?.data).toEqual({ playerClass: 'Mage', other: 'kept', rest: { startOfRound: 'wake' } });
  });

  it('unreadable storage gives the defaults and never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = memoryKvStore();
    broken.get = () => Promise.reject(new Error('disk'));
    __setUserDataStoreForTests(broken);
    expect(await getStepValues()).toEqual(STEP_DEFAULTS);
    await expect(saveStepValues(changed)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[autoleveling] could not read the step values');
    expect(warn).toHaveBeenCalledWith('[autoleveling] could not save the step values');
    warn.mockRestore();
  });
});

describe('the targets the player unticked, per area (L29)', () => {
  beforeEach(() => __setUserDataStoreForTests(memoryKvStore()));

  it('start with nothing unticked and remember what was saved, per area', async () => {
    expect(await getTargetSelection('area-a')).toEqual([]);
    await setTargetSelection('area-a', ['a:wolf', 'c:1']);
    await setTargetSelection('area-b', ['a:bear']);
    expect(await getTargetSelection('area-a')).toEqual(['a:wolf', 'c:1']);
    expect(await getTargetSelection('area-b')).toEqual(['a:bear']);
  });

  it('ticking everything again deletes the record, so it leaves nothing to sync', async () => {
    await setTargetSelection('area-a', ['a:wolf']);
    await setTargetSelection('area-a', []);
    expect((await exportAll()).filter((r) => r.id.startsWith('pref:targets:'))).toEqual([]);
  });

  it('keeps an id that matches no row (the server renamed it) and exports it as a pref record of that area', async () => {
    await setTargetSelection('area-a', ['a:gone']);
    const rec = (await exportAll()).find((r) => r.id === 'pref:targets:area-a');
    expect(rec).toMatchObject({ kind: 'pref', areaSlug: 'area-a', data: { deselected: ['a:gone'] } });
  });

  it('a cloud import is checked: a selection without an area, or with no list, is dropped; ids are cleaned', () => {
    expect(normalizeRecord({ id: 'pref:targets:x', kind: 'pref', updatedAt: 1, data: { deselected: ['a:1'] } })).toBeNull();
    expect(normalizeRecord({ id: 'pref:targets:x', kind: 'pref', areaSlug: 'x', updatedAt: 1, data: { deselected: 'a:1' } })).toBeNull();
    expect(normalizeRecord({ id: 'pref:targets:x', kind: 'pref', areaSlug: 'x', updatedAt: 1, data: { deselected: ['a:1', 3, 'a:1'] } })?.data).toEqual({ deselected: ['a:1'] });
  });

  it('unreadable storage ticks everything and never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = memoryKvStore();
    broken.get = () => Promise.reject(new Error('disk'));
    broken.set = () => Promise.reject(new Error('disk'));
    __setUserDataStoreForTests(broken);
    expect(await getTargetSelection('a')).toEqual([]);
    await expect(setTargetSelection('a', ['a:x'])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[autoleveling] could not read the target selection');
    expect(warn).toHaveBeenCalledWith('[autoleveling] could not save the target selection');
    warn.mockRestore();
  });
});
