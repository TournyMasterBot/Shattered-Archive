import { parseAreaFile } from '@shatteredarchive/merc-area';
import { mapFromMerc, type MercAreaInput } from './merc.js';
import { compareWithBuilder, DIFFERENCE_CAP, type BuilderAreaView } from './mercCheck.js';

const room = (vnum: number, name: string, exits: string) => `#${vnum}\n${name}~\nText.\n~\n0 0 1\n${exits}S\n`;
const exit = (door: number, to: number) => `D${door}\nx~\n~\n0 0 ${to}\n`;
const area = (file: string, rooms: string): MercAreaInput => ({
  file,
  area: parseAreaFile(`#AREA\n${file}~\n{ 1 9} ${file}~\n{ 1 9} Me~\n0 99\n\n#ROOMS\n${rooms}#0\n\n#RESETS\nS\n\n#$\n`),
});

const a = area('a.are', room(1, 'One', exit(0, 2) + exit(1, 50) + exit(5, 9)) + room(2, 'Two', exit(2, 1)));
const b = area('b.are', room(50, 'Fifty', exit(3, 1)));
const { map } = mapFromMerc([a, b], { date: '2026-11-11' });

/** What the Builder's map route says for the same files: room 1 east leads into b.are; its door 5 leads to nothing. */
function views(): BuilderAreaView[] {
  return [
    {
      file: 'a.are',
      rooms: [
        { vnum: 1, name: 'One', exits: [{ door: 0, toVnum: 2 }, { door: 1, toVnum: 50, external: { file: 'b.are', name: 'Fifty' } }, { door: 5, toVnum: 9 }] },
        { vnum: 2, name: 'Two', exits: [{ door: 2, toVnum: 1 }] },
      ],
    },
    { file: 'b.are', rooms: [{ vnum: 50, name: 'Fifty', exits: [{ door: 3, toVnum: 1, external: { file: 'a.are', name: 'One' } }] }] },
  ];
}

describe('compareWithBuilder', () => {
  it('agrees when both read the same files, and counts what it compared', () => {
    expect(compareWithBuilder(map, views(), 1)).toEqual({ ok: true, areas: 2, rooms: 3, exits: 4, crossFile: 2, dead: 1, differences: [] });
  });

  it('reads the Builder\'s raw title with its colour sigils as the plain title a player sees', () => {
    const v = views();
    v[0].rooms[0].name = '{ROne{x';
    expect(compareWithBuilder(map, v, 1).ok).toBe(true);
  });

  it('names a room the Builder has and this map lacks, and the reverse', () => {
    const v = views();
    v[0].rooms.push({ vnum: 3, name: 'Three', exits: [] });
    expect(compareWithBuilder(map, v, 1).differences).toEqual(['a.are: room 3 is in the Builder and not in this map']);
    const w = views();
    w[0].rooms.pop();
    // room 1's door 0 now leads to a room the Builder no longer shows, so it counts it as dead
    expect(compareWithBuilder(map, w, 1).differences).toEqual([
      'a.are: room 1 door 0 is here and not a live exit in the Builder',
      'a.are: room 2 is here and not in the Builder',
      'dead exits: the Builder shows 2 and the import counted 1',
    ]);
  });

  it('names a different title, a different target, a different file flag, a missing exit and an extra one', () => {
    const v = views();
    v[0].rooms[0].name = 'Uno ';
    v[0].rooms[0].exits[0].external = { file: 'b.are', name: 'x' }; // another file instead of the same one
    v[0].rooms[1].exits[0].toVnum = 2; // door 2 leads to 2 instead of 1
    v[0].rooms[1].exits.push({ door: 0, toVnum: 1 }); // an exit this map lacks
    v[1].rooms[0].exits = []; // door 3 is no live exit
    expect(compareWithBuilder(map, v, 1).differences).toEqual([
      'a.are: room 1 is "Uno" in the Builder and "One" here',
      'a.are: room 1 door 0: the Builder says another file, this map says the other',
      'a.are: room 2 door 2 leads to 2 in the Builder and 1 here',
      'a.are: room 2 door 0 leads to 1 in the Builder and nowhere here',
      'b.are: room 50 door 3 is here and not a live exit in the Builder',
    ]);
  });

  it('reports a file one side lacks, and a dead-exit total that does not add up', () => {
    const missingHere = compareWithBuilder(map, [...views(), { file: 'c.are', rooms: [{ vnum: 7, name: 'Seven', exits: [] }] }], 1);
    expect(missingHere.differences).toEqual(['c.are: the Builder has 1 rooms and this map has no such area']);
    expect(compareWithBuilder(map, [...views(), { file: 'd.are', rooms: [] }], 1).ok).toBe(true); // an empty file has no area here either
    expect(compareWithBuilder(map, views().slice(0, 1), 1).differences).toEqual(['b.are: this map has the area and the Builder did not report it']);
    expect(compareWithBuilder(map, views(), 4).differences).toEqual(['dead exits: the Builder shows 1 and the import counted 4']);
  });

  it('falls back to the area id when an area has no source reference, and names a flag the other way round', () => {
    const bare = JSON.parse(JSON.stringify(map));
    for (const area of bare.continents[0].areas) delete area.sources;
    const v = views();
    v[0].file = 'ma-a';
    v[1].file = 'ma-b';
    v[1].rooms[0].exits[0].external = undefined;
    expect(compareWithBuilder(bare, v, 1).differences).toEqual([
      'ma-b: room 50 door 3 is here and not a live exit in the Builder',
      'dead exits: the Builder shows 2 and the import counted 1',
    ]);
    const w = views();
    w[0].rooms[1].exits[0].external = { file: 'z.are', name: 'z' };
    expect(compareWithBuilder(map, w, 1).differences).toEqual(['a.are: room 2 door 2: the Builder says another file, this map says the other']);
    const x = views();
    x[0].rooms[0].exits[1].toVnum = 50;
    x[0].rooms[0].exits[1].external = undefined;
    x[0].rooms.push({ vnum: 50, name: 'Fifty', exits: [] });
    expect(compareWithBuilder(map, x, 1).differences.some((d) => d.includes('the Builder says the same file'))).toBe(true);
  });

  it('ignores a second exit of the Builder on a door it already showed', () => {
    const v = views();
    v[0].rooms[1].exits.push({ door: 2, toVnum: 1 });
    expect(compareWithBuilder(map, v, 1).ok).toBe(true);
  });

  it('lists at most the cap of differences but still says it is not ok', () => {
    const v = views();
    for (let i = 0; i < DIFFERENCE_CAP + 10; i += 1) v[0].rooms.push({ vnum: 100 + i, name: 'x', exits: [] });
    const result = compareWithBuilder(map, v, 1);
    expect(result.ok).toBe(false);
    expect(result.differences).toHaveLength(DIFFERENCE_CAP);
  });
});
