// apps/game-client/src/features/autoleveling/autoleveling-user-data.test.ts

import { memoryKvStore } from './autoleveling-idb';
import {
  __setUserDataStoreForTests,
  addCustomTarget,
  bumpLearnedCooldown,
  exportAll,
  getBuffOverlay,
  getCustomTargets,
  getFightOverlay,
  getLearnedCooldown,
  getPrefs,
  importRecords,
  setBuffOverlay,
  setFightOverlay,
  setPrefs,
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
