import { planZones, tidyName, type ZoneRow } from './zones.js';

const zone = (zoneId: number, name: string, parent: number | null): ZoneRow => ({ zoneId, name, parent });
const counts = (pairs: [number, number][]): Map<number, number> => new Map(pairs);

describe('planZones: the CMud zone rules', () => {
  it('a root is a continent, a zone under it an area, a zone under that a subzone of the area', () => {
    const zones = [
      zone(1, 'WESTLANDS', -1),
      zone(2, 'Harbor Town', 1),
      zone(3, 'Old Docks', 2),
      zone(4, 'Customs House', 3),
      zone(5, 'Stonewood', 1),
    ];
    const { plans, unmatched, empty } = planZones(
      zones,
      counts([
        [2, 40],
        [3, 12],
        [4, 5],
        [5, 20],
      ]),
    );
    expect(unmatched).toEqual([]);
    expect(empty).toEqual([]);
    expect(plans.get(1)).toMatchObject({
      role: 'continent',
      depth: 1,
      continent: 1,
      area: undefined,
      name: 'Westlands',
      rooms: 0,
    });
    expect(plans.get(2)).toMatchObject({
      role: 'area',
      depth: 2,
      continent: 1,
      area: 2,
      name: 'Harbor Town',
      rooms: 40,
    });
    expect(plans.get(3)).toMatchObject({
      role: 'subzone',
      depth: 3,
      continent: 1,
      area: 2,
      name: 'Old Docks',
      rooms: 12,
    });
    // a chain three zones deep under an area: the deepest is still a subzone of the DEPTH-2 ancestor
    expect(plans.get(4)).toMatchObject({ role: 'subzone', depth: 4, continent: 1, area: 2, rooms: 5 });
    expect(plans.get(5)).toMatchObject({ role: 'area', area: 5 });
  });

  it('lists a zone whose parent is not in the table instead of guessing, and the zones below it', () => {
    const zones = [
      zone(1, 'North', -1),
      zone(2, 'Frost Keep', 1),
      zone(10, 'Lost Place', 99),
      zone(11, 'Lost Cellar', 10),
    ];
    const { plans, unmatched } = planZones(
      zones,
      counts([
        [10, 3],
        [11, 2],
      ]),
    );
    expect([...plans.keys()].sort()).toEqual([1, 2]);
    expect(unmatched).toEqual([
      { zoneId: 10, name: 'Lost Place', reason: 'orphan-parent', rooms: 3 },
      { zoneId: 11, name: 'Lost Cellar', reason: 'unmatched-ancestor', rooms: 2 },
    ]);
  });

  it('breaks a loop: every zone in it is listed as a cycle and nothing hangs', () => {
    const zones = [
      zone(1, 'Root', -1),
      zone(20, 'Ring A', 21),
      zone(21, 'Ring B', 22),
      zone(22, 'Ring C', 20),
      zone(23, 'Self', 23),
    ];
    const { plans, unmatched } = planZones(zones, counts([]));
    expect([...plans.keys()]).toEqual([1]);
    expect(unmatched.map((u) => [u.zoneId, u.reason])).toEqual([
      [20, 'cycle'],
      [21, 'cycle'],
      [22, 'cycle'],
      [23, 'cycle'],
    ]);
  });

  it('treats a missing parent as an orphan, and a chain longer than the guard as a cycle', () => {
    const long: ZoneRow[] = [zone(1, 'Root', -1)];
    for (let i = 2; i <= 40; i += 1) long.push(zone(i, `Z${i}`, i - 1));
    const { plans, unmatched } = planZones([zone(500, 'No parent', null), ...long], counts([]));
    expect(unmatched.find((u) => u.zoneId === 500)?.reason).toBe('orphan-parent');
    expect(plans.get(30)).toBeDefined(); // 30 deep is inside the guard
    expect(plans.get(40)).toBeUndefined();
    expect(unmatched.find((u) => u.zoneId === 40)?.reason).toBe('cycle');
  });

  it('keeps the first of two zones with the same id and lists the other', () => {
    const { plans, unmatched } = planZones(
      [zone(1, 'Root', -1), zone(2, 'First', 1), zone(2, 'Second', 1)],
      counts([]),
    );
    expect(plans.get(2)?.name).toBe('First');
    expect(unmatched).toEqual([{ zoneId: 2, name: 'Second', reason: 'duplicate-id', rooms: 0 }]);
  });

  it('notes a zone with no rooms and no children as empty, but not a container with children', () => {
    const zones = [zone(1, 'Root', -1), zone(2, 'Container', 1), zone(3, 'Inside', 2), zone(4, 'Nothing', 1)];
    expect(planZones(zones, counts([[3, 7]])).empty).toEqual([4]);
  });

  it('marks a zone with "maze" in its name as a maze, and nothing else by name', () => {
    const zones = [
      zone(1, 'Root', -1),
      zone(2, 'Hedge Maze', 1),
      zone(3, 'Hedgemaze', 1),
      zone(4, 'The Sewers', 1),
      zone(5, 'Labyrinth', 1),
    ];
    const { plans } = planZones(zones, counts([]));
    expect(plans.get(2)?.kind).toBe('maze');
    expect(plans.get(3)?.kind).toBe('maze');
    expect(plans.get(4)?.kind).toBe('consistent'); // sewers are not regrouped or retyped by guess
    expect(plans.get(5)?.kind).toBe('consistent');
  });

  it('gives a nameless zone a name from its id', () => {
    const { plans } = planZones([zone(1, 'Root', -1), zone(7, '   ', 1)], counts([]));
    expect(plans.get(7)?.name).toBe('Zone 7');
  });

  it('an empty table has no plans', () => {
    expect(planZones([], counts([]))).toEqual({ plans: new Map(), unmatched: [], empty: [] });
  });
});

describe('tidyName', () => {
  it('shows an all-capitals name in capitals and lower case, and leaves other names alone', () => {
    expect(tidyName('ALTHAINIA', 'x')).toBe('Althainia');
    expect(tidyName('SHOKONO', 'x')).toBe('Shokono');
    expect(tidyName("MIDEN'NIR", 'x')).toBe("Miden'nir");
    expect(tidyName('ICE-WALL PASS', 'x')).toBe('Ice-Wall Pass');
    expect(tidyName('University of Althainia', 'x')).toBe('University of Althainia');
    expect(tidyName('Sub-Issue Gladiator Arena', 'x')).toBe('Sub-Issue Gladiator Arena');
  });

  it('keeps short all-capitals names (initials) and tidies spacing', () => {
    expect(tidyName('GM', 'x')).toBe('GM');
    expect(tidyName('  Old   Docks ', 'x')).toBe('Old Docks');
  });

  it('uses the fallback for nothing', () => {
    for (const none of [null, undefined, '', '  ']) expect(tidyName(none, 'Zone 9')).toBe('Zone 9');
  });
});
