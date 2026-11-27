import type { AutoPilotAbility } from './autoleveling-content-types';
import { BUFF_CATALOG } from './autoleveling-buff-catalog';
import { DEFAULT_REFRESH_TICKS, buffRowFromCatalog, defaultBuffRows, defaultFightRows } from './autoleveling-class-defaults';

// New rows start from what the class feed knows (live findings 2026-11-14, item 7): the measured lag becomes the reuse time of a fight row, the duration the recast
// interval of a tick-gated buff. Rows that were already saved are never rewritten by it (L39), and an ability the feed knows nothing about starts as before.

const ab = (name: string, type: AutoPilotAbility['type'], level: number, extra: Partial<AutoPilotAbility> = {}): AutoPilotAbility => ({ name, type, level, groups: [], ...extra });

describe('defaultFightRows starts the reuse time at the measured lag', () => {
  it('seeds each picked ability with its own lag in seconds, and 0 for one with no lag', () => {
    const offense = [
      ab('Frostbolt', 'spell', 20, { groups: ['Attack'], lagMs: 3800 }),
      ab('Zap', 'spell', 10, { groups: ['Attack'], lagMs: 1850 }),
      ab('Kick', 'skill', 1, { groups: ['Attack'] }),
    ];
    const rows = defaultFightRows(offense, null);
    expect(rows.map((r) => [r.cmd, r.cooldownSec])).toEqual([
      ["cast 'frostbolt' {name}", 3.8],
      ["cast 'zap' {name}", 1.9],
      ['kick', 0],
    ]);
  });

  it('a measured 0 is 0, and an ability the feed knows nothing about is 0 too (as before)', () => {
    const rows = defaultFightRows([ab('Bash', 'skill', 1, { groups: ['Attack'], lagMs: 0 }), ab('Trip', 'skill', 1, { groups: ['Attack'] })], null);
    expect(rows.every((r) => r.cooldownSec === 0)).toBe(true);
  });
});

describe('a tick-gated buff recasts from the feed duration', () => {
  const berserk = BUFF_CATALOG.find((c) => c.label === 'Berserk')!;

  it('every duration minus one ticks when the class feed knows the duration', () => {
    expect(buffRowFromCatalog(berserk, { durationTicks: 10 }).refreshTicks).toBe(9);
    expect(buffRowFromCatalog(berserk, { durationTicks: 0 }).refreshTicks).toBe(1);
  });

  it('the default interval when the duration is unknown or no ability is given', () => {
    expect(buffRowFromCatalog(berserk).refreshTicks).toBe(DEFAULT_REFRESH_TICKS);
    expect(buffRowFromCatalog(berserk, {}).refreshTicks).toBe(DEFAULT_REFRESH_TICKS);
  });

  it('an affect-gated buff has no tick count at all, whatever the feed says', () => {
    const sanctuary = BUFF_CATALOG.find((c) => c.label === 'Sanctuary')!;
    expect(buffRowFromCatalog(sanctuary, { durationTicks: 12 })).not.toHaveProperty('refreshTicks');
  });

  it('defaultBuffRows hands the class ability to the row, matched by label or by affect name', () => {
    const rows = defaultBuffRows([ab('Berserk', 'skill', 5, { durationTicks: 4 }), ab('Sanctuary', 'spell', 20, { durationTicks: 12 })], null);
    expect(rows.find((r) => r.label === 'Berserk')?.refreshTicks).toBe(3);
    expect(rows.find((r) => r.label === 'Sanctuary')).not.toHaveProperty('refreshTicks');
  });

  it('defaultBuffRows keeps today\'s interval for a class whose berserk has no duration in the feed', () => {
    const rows = defaultBuffRows([ab('Berserk', 'skill', 5)], null);
    expect(rows.find((r) => r.label === 'Berserk')?.refreshTicks).toBe(DEFAULT_REFRESH_TICKS);
  });
});

describe('rows that are already saved are not touched (L39, SETTINGS-01)', () => {
  it('the seeding functions only build new rows: they take no stored row and return fresh objects each call', () => {
    const berserk = BUFF_CATALOG.find((c) => c.label === 'Berserk')!;
    const first = buffRowFromCatalog(berserk, { durationTicks: 10 });
    first.refreshTicks = 2; // the player edits their row
    expect(buffRowFromCatalog(berserk, { durationTicks: 10 }).refreshTicks).toBe(9);
    expect(defaultFightRows([ab('Bash', 'skill', 1, { groups: ['Attack'], lagMs: 900 })], null)[0]).not.toBe(defaultFightRows([ab('Bash', 'skill', 1, { groups: ['Attack'], lagMs: 900 })], null)[0]);
  });
});
