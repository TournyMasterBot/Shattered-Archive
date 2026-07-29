import fs from 'fs';
import os from 'os';
import path from 'path';
import { ArmyLayoutStore } from './army-layout-store.js';

function tmpDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kt-army-layout-test-'));
}

describe('ArmyLayoutStore', () => {
  it('round-trips a saved collection', () => {
    const store = new ArmyLayoutStore(tmpDataDir());
    store.save('acc1', [{ name: 'My Army', picks: [{ raceKey: 'Human', classKey: 'Warrior' }] }]);
    expect(store.list('acc1')).toEqual([{ name: 'My Army', picks: [{ raceKey: 'Human', classKey: 'Warrior' }] }]);
  });

  it('returns an empty list for an unknown account', () => {
    const store = new ArmyLayoutStore(tmpDataDir());
    expect(store.list('nobody')).toEqual([]);
  });

  it('caps at 100 armies, keeping the first 100 given', () => {
    const store = new ArmyLayoutStore(tmpDataDir());
    const armies = Array.from({ length: 120 }, (_, i) => ({ name: `army-${i}`, picks: [] }));
    store.save('acc1', armies);
    const saved = store.list('acc1');
    expect(saved).toHaveLength(100);
    expect(saved[0].name).toBe('army-0');
    expect(saved[99].name).toBe('army-99');
  });

  it('an army save fully replaces the prior collection (whole-collection PUT semantics)', () => {
    const store = new ArmyLayoutStore(tmpDataDir());
    store.save('acc1', [{ name: 'old', picks: [] }]);
    store.save('acc1', [{ name: 'new', picks: [] }]);
    expect(store.list('acc1')).toEqual([{ name: 'new', picks: [] }]);
  });
});
