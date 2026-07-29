import { listSavedArmies, saveArmy, removeArmy, replaceAllArmies } from './saved-armies';

beforeEach(() => globalThis.localStorage.clear());

describe('saved-armies', () => {
  it('saves, lists, overwrites by name, and removes', () => {
    expect(listSavedArmies()).toEqual([]);

    saveArmy('Alpha', [{ raceKey: 'Human', classKey: 'Warrior' }]);
    saveArmy('Bravo', [{ raceKey: 'Human', classKey: 'Ranger' }]);
    expect(listSavedArmies().map((a) => a.name)).toEqual(['Alpha', 'Bravo']);

    // Overwrite by name.
    saveArmy('Alpha', [
      { raceKey: 'Human', classKey: 'Warrior' },
      { raceKey: 'Human', classKey: 'Warrior' },
    ]);
    const alpha = listSavedArmies().find((a) => a.name === 'Alpha')!;
    expect(alpha.picks).toHaveLength(2);
    expect(listSavedArmies()).toHaveLength(2); // still one Alpha

    removeArmy('Alpha');
    expect(listSavedArmies().map((a) => a.name)).toEqual(['Bravo']);
  });

  it('ignores blank names and persists across reads (localStorage)', () => {
    saveArmy('   ', [{ raceKey: 'Human', classKey: 'Warrior' }]);
    expect(listSavedArmies()).toEqual([]);
    saveArmy('Keep', [{ raceKey: 'Human', classKey: 'Mage' }]);
    // A fresh read reflects the persisted store.
    expect(listSavedArmies().find((a) => a.name === 'Keep')?.picks).toEqual([
      { raceKey: 'Human', classKey: 'Mage' },
    ]);
  });

  it('replaceAllArmies wholesale-overwrites (not merges) the local collection', () => {
    saveArmy('Local1', [{ raceKey: 'Human', classKey: 'Warrior' }]);
    saveArmy('Local2', [{ raceKey: 'Human', classKey: 'Ranger' }]);

    replaceAllArmies([{ name: 'FromCloud', picks: [{ raceKey: 'Elf', classKey: 'Mage' }] }]);

    expect(listSavedArmies()).toEqual([{ name: 'FromCloud', picks: [{ raceKey: 'Elf', classKey: 'Mage' }] }]);
  });
});
