// apps/game-client/src/features/autoleveling/autoleveling-user-data.test.ts

import { memoryKvStore } from './autoleveling-idb';
import {
  SYNCED_RECORD_KINDS,
  __setUserDataStoreForTests,
  addCustomTarget,
  bumpLearnedCooldown,
  deleteTargetOverride,
  exportAll,
  getBuffOverlay,
  getBuffOverlayOrNull,
  getCustomTargets,
  getFightOverlay,
  getFightOverlayOrNull,
  getLearnedCooldown,
  getPrefs,
  getTargetOverrides,
  importRecords,
  normalizeRecord,
  removeCustomTarget,
  resetTargetOverride,
  setBuffOverlay,
  setFightOverlay,
  setPrefs,
  setTargetOverride,
  updateCustomTarget,
  upsertCustomPath,
} from './autoleveling-user-data';

// ensureMigrated() memoizes its promise per module instance — reset the module
// between tests so each gets a fresh migration against a fresh store.
beforeEach(() => {
  jest.resetModules();
});

async function freshModule() {
  const mod = await import('./autoleveling-user-data');
  mod.__setUserDataStoreForTests(memoryKvStore());
  return mod;
}

describe('autoleveling-user-data', () => {
  it('adds and reads custom targets per area', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await addCustomTarget('centaur-village', { lookName: 'A lone centaur scout.', engageName: 'scout' });
    await addCustomTarget('gahboom-factory', { lookName: 'A gahboom foreman barks orders.', engageName: 'foreman' });

    const centaur = await getCustomTargets('centaur-village');
    expect(centaur).toHaveLength(1);
    expect(centaur[0].data.engageName).toBe('scout');
    expect(await getCustomTargets('gahboom-factory')).toHaveLength(1);
    expect(await getCustomTargets('new-mudschool')).toHaveLength(0);
  });

  it('stores a buff overlay as a replaceable list', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await setBuffOverlay('centaur-village', [{ label: 'Sanc', cmd: 'cast sanctuary', affect: 'sanctuary' }]);
    expect(await getBuffOverlay('centaur-village')).toHaveLength(1);

    await setBuffOverlay('centaur-village', [
      { label: 'Sanc', cmd: 'cast sanctuary', affect: 'sanctuary' },
      { label: 'Haste', cmd: 'quaff speed' },
    ]);
    const rows = await getBuffOverlay('centaur-village');
    expect(rows).toHaveLength(2);
    expect(rows[1].cmd).toBe('quaff speed');
  });

  it('stores buff rows with tick / in-combat / hold-near-level fields', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await setBuffOverlay('centaur-village', [
      { label: 'Sanctuary', cmd: "cast 'sanctuary'", affect: 'sanctuary', inCombatCmd: 'quaff divine' },
      { label: 'Haste', cmd: "cast 'haste'", affect: 'haste', holdNearLevel: true },
      { label: 'Berserk', cmd: 'berserk', refreshTicks: 6 },
    ]);
    const rows = await getBuffOverlay('centaur-village');
    expect(rows).toHaveLength(3);
    expect(rows[0].inCombatCmd).toBe('quaff divine');
    expect(rows[1].holdNearLevel).toBe(true);
    expect(rows[2].refreshTicks).toBe(6);
    expect(rows[2].affect).toBeUndefined();
  });

  it('keeps fight overlays separate per class', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await setFightOverlay('centaur-village', 'Warrior', [{ cmd: 'bash', cooldownSec: 8 }]);
    await setFightOverlay('centaur-village', 'Mage', [{ cmd: 'cast fireball', cooldownSec: 0 }]);

    expect(await getFightOverlay('centaur-village', 'warrior')).toEqual([{ cmd: 'bash', cooldownSec: 8 }]);
    expect(await getFightOverlay('centaur-village', 'MAGE')).toEqual([{ cmd: 'cast fireball', cooldownSec: 0 }]);
  });

  it('learned cooldown is unset until bumped, then round-trips by (normalized) command', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    expect(await getLearnedCooldown('gore')).toBeNull();

    await bumpLearnedCooldown('gore', 0.5);
    expect(await getLearnedCooldown('gore')).toBe(0.5);
    // Case/whitespace-insensitive — it's the same ability regardless of how it was typed.
    expect(await getLearnedCooldown('  GORE  ')).toBe(0.5);

    await bumpLearnedCooldown('gore', 1); // last write wins
    expect(await getLearnedCooldown('gore')).toBe(1);

    // A different ability is tracked independently.
    expect(await getLearnedCooldown('bash')).toBeNull();
  });

  it('round-trips prefs', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    expect(await getPrefs()).toEqual({});
    await setPrefs({ playerClass: 'ranger' });
    expect((await getPrefs()).playerClass).toBe('ranger');
  });

  it('exportAll / importRecords is last-writer-wins by updatedAt', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await setPrefs({ playerClass: 'thief' });
    const exported = await exportAll();
    expect(exported.some((r) => r.kind === 'pref')).toBe(true);

    await importRecords([
      { id: 'pref:global', kind: 'pref', data: { playerClass: 'cleric' }, updatedAt: Date.now() + 10_000 },
    ]);
    expect((await getPrefs()).playerClass).toBe('cleric');

    await importRecords([
      { id: 'pref:global', kind: 'pref', data: { playerClass: 'stale' }, updatedAt: 1 },
    ]);
    expect((await getPrefs()).playerClass).toBe('cleric'); // stale import ignored
  });

  it('survives a full export -> cloud (JSON) -> fresh-store import round-trip', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await addCustomTarget('centaur-village', { lookName: 'A lone centaur scout.', engageName: 'scout' });
    await setBuffOverlay('centaur-village', [{ label: 'Sanc', cmd: 'cast sanctuary', affect: 'sanctuary' }]);
    await setFightOverlay('centaur-village', 'Warrior', [{ cmd: 'bash', cooldownSec: 8 }]);
    await setPrefs({ playerClass: 'warrior' });

    // Simulate what cloudSync.saveAutolevelUserData / loadAutolevelUserData do to
    // the payload in transit — a plain JSON round-trip over the wire.
    const wire = JSON.parse(JSON.stringify(await exportAll()));

    __setUserDataStoreForTests(memoryKvStore());
    await importRecords(wire);

    expect(await getCustomTargets('centaur-village')).toHaveLength(1);
    expect(await getBuffOverlay('centaur-village')).toHaveLength(1);
    expect(await getFightOverlay('centaur-village', 'warrior')).toEqual([{ cmd: 'bash', cooldownSec: 8 }]);
    expect((await getPrefs()).playerClass).toBe('warrior');
  });

  it('migrates legacy localStorage stores once', async () => {
    localStorage.setItem(
      'shatteredarchive:autoleveling:manual-targets',
      JSON.stringify({ 'arkania::centaur village': [{ lookName: 'An old centaur.', engageName: 'centaur' }] }),
    );
    localStorage.setItem(
      'shatteredarchive:autoleveling:user-paths',
      JSON.stringify([
        { id: 'p1', name: 'My path', continentName: 'Arkania', areaName: 'Centaur Village', mode: 'auto_level', steps: [], raw: '' },
      ]),
    );

    const mod = await freshModule();
    const migrated = await mod.getCustomTargets('centaur-village');
    expect(migrated).toHaveLength(1);
    expect(migrated[0].legacy).toBe(true);
    expect(await mod.getCustomPaths()).toHaveLength(1);

    // second call: no duplicate migration
    const again = await mod.getCustomTargets('centaur-village');
    expect(again).toHaveLength(1);

    localStorage.clear();
  });
});

describe('every exported kind is one the server accepts (E20, CLOUDSYNC-01)', () => {
  // Mirror of the server's AutolevelUserRecords.Kinds (DSL repo); the C# test pins the same literal.
  const SERVER_KINDS = ['target', 'buff', 'fight', 'path', 'pref', 'abilityTiming', 'targetOverride'];

  it('SYNCED_RECORD_KINDS equals the server list', () => {
    expect([...SYNCED_RECORD_KINDS]).toEqual(SERVER_KINDS);
  });

  it('exportAll after using every feature only ever yields kinds in that list', async () => {
    __setUserDataStoreForTests(memoryKvStore());
    await addCustomTarget('a', { lookName: 'A scout.', engageName: 'scout' });
    await setBuffOverlay('a', [{ label: 'Sanc', cmd: 'cast sanctuary' }]);
    await setFightOverlay('a', 'Warrior', [{ cmd: 'bash', cooldownSec: 1 }]);
    await setPrefs({ playerClass: 'warrior' });
    await upsertCustomPath({ id: 'p', name: 'p', continentName: 'c', areaName: 'a', mode: 'auto_level', steps: [], raw: '' } as any);
    await bumpLearnedCooldown('bash', 2);
    await setTargetOverride('a', RANGER, { engageName: 'rng' });

    const kinds = new Set((await exportAll()).map((r) => r.kind));
    expect([...kinds].sort()).toEqual([...SERVER_KINDS].sort());
    for (const k of kinds) expect(SERVER_KINDS).toContain(k);
  });
});

const RANGER = { lookName: 'A centaur ranger eyes you warily.', engageName: 'ranger' };
const RANGER_KEY = 'a centaur ranger eyes you warily.';

describe('target overrides (E1, E6, E15, E16, E22)', () => {
  beforeEach(() => __setUserDataStoreForTests(memoryKvStore()));

  it('stores only what differs and reads it back for the right area only', async () => {
    const res = await setTargetOverride('centaur-village', RANGER, { engageName: 'rng' });
    expect(res.ok).toBe(true);

    const mine = await getTargetOverrides('centaur-village');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: 'targetOverride', areaSlug: 'centaur-village', data: { key: RANGER_KEY, engageName: 'rng' } });
    expect(mine[0].data).not.toHaveProperty('lookName');
    expect(await getTargetOverrides('gahboom-factory')).toEqual([]);
  });

  it('writes nothing for a save with no edits (SETTINGS-01)', async () => {
    const res = await setTargetOverride('centaur-village', RANGER, { lookName: RANGER.lookName, engageName: 'ranger' });
    expect(res).toEqual({ ok: true, record: null });
    expect((await exportAll()).filter((r) => r.kind === 'targetOverride')).toEqual([]);
  });

  it('an edit back to the default deletes the record, an edit of another field keeps it', async () => {
    await setTargetOverride('centaur-village', RANGER, { engageName: 'rng' });
    await setTargetOverride('centaur-village', RANGER, { hidden: true });
    expect((await getTargetOverrides('centaur-village'))[0].data).toEqual({ key: RANGER_KEY, engageName: 'rng', hidden: true });

    await setTargetOverride('centaur-village', RANGER, { engageName: 'ranger' });
    expect((await getTargetOverrides('centaur-village'))[0].data).toEqual({ key: RANGER_KEY, hidden: true });

    await setTargetOverride('centaur-village', RANGER, { hidden: false });
    expect(await getTargetOverrides('centaur-village')).toEqual([]);
  });

  it('uses one deterministic record per (area, target), so a second edit updates it instead of adding one', async () => {
    await setTargetOverride('centaur-village', RANGER, { engageName: 'a' });
    await setTargetOverride('centaur-village', RANGER, { engageName: 'b' });
    const recs = await getTargetOverrides('centaur-village');
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe(`targetOverride:centaur-village:${RANGER_KEY}`);
    expect(recs[0].data.engageName).toBe('b');
  });

  it('refuses an unsafe edit and stores nothing', async () => {
    expect(await setTargetOverride('centaur-village', RANGER, { engageName: 'x;quit' })).toEqual({ ok: false, error: 'unsafe' });
    expect(await setTargetOverride('centaur-village', RANGER, { lookName: '' })).toEqual({ ok: false, error: 'unsafe' });
    expect(await getTargetOverrides('centaur-village')).toEqual([]);
  });

  it('reset removes both the edit and the hidden flag (E6)', async () => {
    await setTargetOverride('centaur-village', RANGER, { engageName: 'rng', hidden: true });
    await resetTargetOverride('centaur-village', RANGER_KEY);
    expect(await getTargetOverrides('centaur-village')).toEqual([]);
  });

  it('reset also removes an imported record that carries a different id for the same key', async () => {
    await importRecords([
      { id: 'targetOverride:other-device-id', kind: 'targetOverride', areaSlug: 'centaur-village', data: { key: RANGER_KEY, hidden: true }, updatedAt: 5 },
    ]);
    expect(await getTargetOverrides('centaur-village')).toHaveLength(1);
    await resetTargetOverride('centaur-village', RANGER_KEY);
    expect(await getTargetOverrides('centaur-village')).toEqual([]);
  });

  it('an unmatched override stays stored and exported until the player deletes it (E22)', async () => {
    await setTargetOverride('centaur-village', RANGER, { engageName: 'rng' });
    // the server list no longer has RANGER: nothing here removes the record
    expect((await exportAll()).filter((r) => r.kind === 'targetOverride')).toHaveLength(1);
    const [rec] = await getTargetOverrides('centaur-village');
    await deleteTargetOverride(rec.id);
    expect(await getTargetOverrides('centaur-village')).toEqual([]);
  });

  it('deleteTargetOverride ignores an id that is not an override record', async () => {
    const t = await addCustomTarget('centaur-village', { lookName: 'A scout.', engageName: 'scout' });
    await deleteTargetOverride(t.id);
    expect(await getCustomTargets('centaur-village')).toHaveLength(1);
  });

  it('a throwing store leaves readers with nothing and writers with a storage error, never throwing (E12)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = memoryKvStore();
    broken.keys = async () => {
      throw new Error('storage unavailable');
    };
    broken.set = async () => {
      throw new Error('storage unavailable');
    };
    broken.delete = async () => {
      throw new Error('storage unavailable');
    };
    __setUserDataStoreForTests(broken);

    expect(await getTargetOverrides('centaur-village')).toEqual([]);
    expect(await setTargetOverride('centaur-village', RANGER, { engageName: 'rng' })).toEqual({ ok: false, error: 'storage' });
    await expect(resetTargetOverride('centaur-village', RANGER_KEY)).resolves.toBeUndefined();
    await expect(deleteTargetOverride('x')).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('round-trips through export, the wire and a fresh store (E13, E18)', async () => {
    await setTargetOverride('centaur-village', RANGER, { engageName: 'rng', hidden: true });
    const wire = JSON.parse(JSON.stringify(await exportAll()));
    __setUserDataStoreForTests(memoryKvStore());
    await importRecords(wire);
    expect((await getTargetOverrides('centaur-village'))[0].data).toEqual({ key: RANGER_KEY, engageName: 'rng', hidden: true });
  });

  it('on import the newest updatedAt wins per override record (E13)', async () => {
    const base = { id: 'targetOverride:centaur-village:' + RANGER_KEY, kind: 'targetOverride' as const, areaSlug: 'centaur-village' };
    await importRecords([{ ...base, data: { key: RANGER_KEY, engageName: 'newer' }, updatedAt: 20 }]);
    await importRecords([{ ...base, data: { key: RANGER_KEY, engageName: 'older' }, updatedAt: 10 }]);
    expect((await getTargetOverrides('centaur-village'))[0].data.engageName).toBe('newer');
  });
});

describe('normalizeRecord and importRecords drop what must not be stored (E3, E5, E18)', () => {
  beforeEach(() => __setUserDataStoreForTests(memoryKvStore()));

  it.each([
    ['null', null],
    ['no id', { kind: 'pref', data: {}, updatedAt: 1 }],
    ['an unknown kind', { id: 'x', kind: 'nope', data: {}, updatedAt: 1 }],
    ['no data', { id: 'x', kind: 'pref', updatedAt: 1 }],
    ['an override with no areaSlug', { id: 'x', kind: 'targetOverride', data: { key: 'k' }, updatedAt: 1 }],
    ['an override with unsafe data', { id: 'x', kind: 'targetOverride', areaSlug: 'a', data: { key: 'k', engageName: 'a;b' }, updatedAt: 1 }],
    ['a custom target with a stacked command', { id: 'x', kind: 'target', areaSlug: 'a', data: { lookName: 'A scout.', engageName: 'scout;quit' }, updatedAt: 1 }],
    ['a custom target with no keyword', { id: 'x', kind: 'target', areaSlug: 'a', data: { lookName: 'A scout.' }, updatedAt: 1 }],
  ])('refuses %s', (_label, rec) => {
    expect(normalizeRecord(rec)).toBeNull();
  });

  it('an incoming record replaces a stored one that has no updatedAt (it counts as oldest)', async () => {
    const store = memoryKvStore({ 'pref:global': { id: 'pref:global', kind: 'pref', data: { playerClass: 'old' } } });
    __setUserDataStoreForTests(store);
    await importRecords([{ id: 'pref:global', kind: 'pref', data: { playerClass: 'new' }, updatedAt: 1 }]);
    expect((await getPrefs()).playerClass).toBe('new');
  });

  it('updateCustomTarget treats a target with missing fields as unsafe rather than throwing', async () => {
    const t = await addCustomTarget('centaur-village', { lookName: 'A scout.', engageName: 'scout' });
    expect(await updateCustomTarget(t.id, {} as never)).toEqual({ ok: false, error: 'unsafe' });
    expect(await updateCustomTarget(t.id, undefined as never)).toEqual({ ok: false, error: 'unsafe' });
  });

  it('coerces a missing or non-numeric updatedAt to 0 and keeps the record', () => {
    expect(normalizeRecord({ id: 'pref:global', kind: 'pref', data: { playerClass: 'x' }, updatedAt: 'soon' })).toMatchObject({ updatedAt: 0 });
  });

  it('a malformed record in a cloud load does not stop the valid ones', async () => {
    await importRecords([
      { id: 'x', kind: 'nope', data: {}, updatedAt: 1 } as any,
      { id: 'targetOverride:a:k', kind: 'targetOverride', areaSlug: 'a', data: { key: 'k;', hidden: true }, updatedAt: 1 } as any,
      { id: 'pref:global', kind: 'pref', data: { playerClass: 'mage' }, updatedAt: 1 },
    ]);
    expect((await getPrefs()).playerClass).toBe('mage');
    expect((await exportAll()).map((r) => r.id)).toEqual(['pref:global']);
  });
});

describe('overlay readers that tell "never saved" from "saved empty" (E19, SETTINGS-06)', () => {
  beforeEach(() => __setUserDataStoreForTests(memoryKvStore()));

  it('answers null for an area or class that was never saved, [] for one saved empty, and the rows for one saved', async () => {
    expect(await getBuffOverlayOrNull('a')).toBeNull();
    expect(await getFightOverlayOrNull('a', 'Warrior')).toBeNull();

    await setBuffOverlay('a', []);
    await setFightOverlay('a', 'Warrior', []);
    expect(await getBuffOverlayOrNull('a')).toEqual([]);
    expect(await getFightOverlayOrNull('a', 'Warrior')).toEqual([]);

    await setBuffOverlay('a', [{ label: 'Sanc', cmd: 'cast sanctuary' }]);
    await setFightOverlay('a', 'Warrior', [{ cmd: 'bash', cooldownSec: 8 }]);
    expect(await getBuffOverlayOrNull('a')).toEqual([{ label: 'Sanc', cmd: 'cast sanctuary' }]);
    expect(await getFightOverlayOrNull('a', 'warrior')).toEqual([{ cmd: 'bash', cooldownSec: 8 }]); // class is case-insensitive
  });

  it('a paused fight command stays paused through the store and through a cloud round trip', async () => {
    const rows = [
      { cmd: 'bash', cooldownSec: 8 },
      { cmd: 'kick', cooldownSec: 2, disabled: true },
    ];
    await setFightOverlay('a', 'Warrior', rows);
    expect(await getFightOverlayOrNull('a', 'Warrior')).toEqual(rows);

    const wire = JSON.parse(JSON.stringify(await exportAll()));
    __setUserDataStoreForTests(memoryKvStore());
    await importRecords(wire);
    expect(await getFightOverlayOrNull('a', 'Warrior')).toEqual(rows);
  });

  it('keeps areas and classes apart', async () => {
    await setFightOverlay('a', 'Warrior', [{ cmd: 'bash', cooldownSec: 1 }]);
    expect(await getFightOverlayOrNull('a', 'Mage')).toBeNull();
    expect(await getFightOverlayOrNull('b', 'Warrior')).toBeNull();
    expect(await getBuffOverlayOrNull('b')).toBeNull();
  });

  it('treats a record whose data is not a list as saved-empty rather than never-saved', async () => {
    await importRecords([
      { id: 'buff:a', kind: 'buff', areaSlug: 'a', data: { not: 'a list' }, updatedAt: 1 },
      { id: 'fight:a:mage', kind: 'fight', areaSlug: 'a', className: 'mage', data: 'junk', updatedAt: 1 },
    ]);
    expect(await getBuffOverlayOrNull('a')).toEqual([]);
    expect(await getFightOverlayOrNull('a', 'Mage')).toEqual([]);
  });

  it('unreadable storage answers [] (so nothing is seeded over data that may exist) and warns, never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = memoryKvStore();
    broken.keys = async () => {
      throw new Error('storage unavailable');
    };
    __setUserDataStoreForTests(broken);

    expect(await getBuffOverlayOrNull('a')).toEqual([]);
    expect(await getFightOverlayOrNull('a', 'Warrior')).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('custom targets can be edited and removed for good', () => {
  beforeEach(() => __setUserDataStoreForTests(memoryKvStore()));

  it('updateCustomTarget keeps the record id and changes the text', async () => {
    const t = await addCustomTarget('centaur-village', { lookName: 'A scout.', engageName: 'scout' });
    const res = await updateCustomTarget(t.id, { lookName: '  A tall scout.  ', engageName: ' tall ' });
    expect(res.ok).toBe(true);
    const [saved] = await getCustomTargets('centaur-village');
    expect(saved.id).toBe(t.id);
    expect(saved.data).toMatchObject({ lookName: 'A tall scout.', engageName: 'tall' });
  });

  it('updateCustomTarget refuses unsafe text and an unknown id', async () => {
    const t = await addCustomTarget('centaur-village', { lookName: 'A scout.', engageName: 'scout' });
    expect(await updateCustomTarget(t.id, { lookName: 'A scout.', engageName: 'a;b' })).toEqual({ ok: false, error: 'unsafe' });
    expect(await updateCustomTarget('target:nope', { lookName: 'A.', engageName: 'a' })).toEqual({ ok: false, error: 'missing' });
    expect((await getCustomTargets('centaur-village'))[0].data.engageName).toBe('scout');
  });

  it('removeCustomTarget deletes the record, so it does not come back on the next seed', async () => {
    const t = await addCustomTarget('centaur-village', { lookName: 'A scout.', engageName: 'scout' });
    await removeCustomTarget(t.id);
    expect(await getCustomTargets('centaur-village')).toEqual([]);
  });

  it('removeCustomTarget leaves records that are not custom targets alone', async () => {
    await setPrefs({ playerClass: 'mage' });
    await removeCustomTarget('pref:global');
    expect((await getPrefs()).playerClass).toBe('mage');
  });

  it('storage failures in update/remove are reported or swallowed, never thrown', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = await addCustomTarget('centaur-village', { lookName: 'A scout.', engageName: 'scout' });
    const broken = memoryKvStore();
    broken.keys = async () => {
      throw new Error('storage unavailable');
    };
    __setUserDataStoreForTests(broken);
    expect(await updateCustomTarget(t.id, { lookName: 'A scout.', engageName: 'x' })).toEqual({ ok: false, error: 'storage' });
    await expect(removeCustomTarget(t.id)).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
