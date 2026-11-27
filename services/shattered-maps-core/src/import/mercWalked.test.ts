import { parseAreaFile } from '@shatteredarchive/merc-area';
import { LIMITS, type Link, type MapFile, type Room } from '../schema.js';
import { validateMapFile } from '../validate.js';
import { mapFromMerc } from './merc.js';
import { reconcileWalked, WALKED_REPORT_CAP } from './mercWalked.js';

const room = (vnum: number, name: string, exits: string) => `#${vnum}\n${name}~\nText.\n~\n0 0 1\n${exits}S\n`;
const exit = (door: number, to: number) => `D${door}\nx~\n~\n0 0 ${to}\n`;
const are = (file: string, rooms: string) => ({
  file,
  area: parseAreaFile(`#AREA\n${file}~\n{ 1 9} ${file}~\n{ 1 9} Me~\n0 99\n\n#ROOMS\n${rooms}#0\n\n#RESETS\nS\n\n#$\n`),
});
const base = mapFromMerc(
  [
    are(
      'a.are',
      room(1, 'Hall', exit(0, 2) + exit(1, 3)) + room(2, 'Library', exit(2, 1)) + room(3, 'Corridor', exit(3, 1) + exit(1, 4)) + room(4, 'Corridor', exit(3, 3)) + room(5, 'Twin', '') + room(6, 'Twin', ''),
    ),
  ],
  { date: '2026-11-11' },
).map;

let n = 0;
const wr = (title: string, exits: Record<string, string> = {}): Room => ({ id: `w${(n += 1)}`, title, exits, sources: [{ kind: 'walked' }] });
const wl = (from: Room, dir: Link['dir'], to: Room | null, extra: Partial<Link> = {}): Link => {
  const id = `wl${(n += 1)}`;
  from.exits[dir] = id;
  return { id, from: from.id, dir, to: to === null ? null : to.id, state: to === null ? 'unknown-target' : 'candidate', confidence: 0.6, offPage: false, traversals: 1, reverse: false, ...extra };
};
const walkedMap = (rooms: Room[], links: Link[]): MapFile => ({
  version: 1,
  continents: [{ id: 'w', name: 'w', areas: [{ id: 'w', name: 'w', placement: null, subzones: [{ id: 'ws', name: 'ws', kind: 'consistent', rooms }] }] }],
  links,
});
const link = (map: MapFile, id: string) => map.links.find((l) => l.id === id) as Link;

describe('reconcileWalked', () => {
  it('adds a walk to a link the files hold, keeps every file room and link, and leaves a valid map', () => {
    const hall = wr('Hall');
    const library = wr('library');
    const north = wl(hall, 'N', library, { traversals: 3, lastWalked: '2026-11-05', reverse: true });
    const { map, report } = reconcileWalked(base, walkedMap([hall, library], [north]));
    expect(report).toMatchObject({ walkedRooms: 2, matched: 2, walkedLinks: 1, agree: 1, disagree: 0, confirmedLinks: 1 });
    expect(link(map, 'ml1-n')).toMatchObject({ traversals: 3, reverse: true, lastWalked: '2026-11-05', state: 'confirmed', confidence: 1 });
    expect(link(map, 'ml1-n').sources?.map((s) => s.kind)).toEqual(['builder', 'walked']);
    expect(map.links).toHaveLength(base.links.length);
    expect(validateMapFile(map).ok).toBe(true);
    expect(link(base, 'ml1-n').traversals).toBe(0); // the base map itself is not changed
  });

  it('learns that a passage can be walked back from a walk, where the files only show a one-way exit', () => {
    const oneWay = JSON.parse(JSON.stringify(base)) as MapFile;
    link(oneWay, 'ml1-n').reverse = false;
    const hall = wr('Hall');
    const library = wr('Library');
    const there = wl(hall, 'N', library, { reverse: true });
    expect(link(reconcileWalked(oneWay, walkedMap([hall, library], [there])).map, 'ml1-n').reverse).toBe(true);
    const hall2 = wr('Hall');
    const library2 = wr('Library');
    const again = wl(hall2, 'N', library2);
    expect(link(reconcileWalked(oneWay, walkedMap([hall2, library2], [again])).map, 'ml1-n').reverse).toBe(false);
  });

  it('adds counts over several walks, keeps the later date, and adds the walked source once', () => {
    const hall = wr('Hall');
    const library = wr('Library');
    const a = wl(hall, 'N', library, { traversals: 2, lastWalked: '2026-11-05' });
    const hall2 = wr('Hall');
    const library2 = wr('Library');
    const b = wl(hall2, 'N', library2, { traversals: 4, lastWalked: '2026-11-02' });
    const { map } = reconcileWalked(base, walkedMap([hall, library, hall2, library2], [a, b]));
    expect(link(map, 'ml1-n')).toMatchObject({ traversals: 6, lastWalked: '2026-11-05' });
    expect(link(map, 'ml1-n').sources?.filter((s) => s.kind === 'walked')).toHaveLength(1);
  });

  it('takes a date from a walk when the link has none, and caps the traversal count', () => {
    const hall = wr('Hall');
    const library = wr('Library');
    const a = wl(hall, 'N', library, { traversals: LIMITS.maxTraversals, lastWalked: '2026-11-05' });
    const hall2 = wr('Hall');
    const library2 = wr('Library');
    const b = wl(hall2, 'N', library2, { traversals: 5 });
    const { map } = reconcileWalked(base, walkedMap([hall, library, hall2, library2], [a, b]));
    expect(link(map, 'ml1-n').traversals).toBe(LIMITS.maxTraversals);
    const hall3 = wr('Hall');
    const library3 = wr('Library');
    const c = wl(hall3, 'N', library3);
    expect(link(reconcileWalked(base, walkedMap([hall3, library3], [c])).map, 'ml1-n').sources?.find((s) => s.kind === 'walked')).toEqual({ kind: 'walked' });
  });

  it('matches by title and then by the doors walked; twins and unknown titles are not guessed', () => {
    const cor = wr('Corridor', { E: 'x' }); // only the file corridor 3 has an east door
    const east = wr('Corridor', { W: 'y' }); // both file corridors have a west door: ambiguous
    const hall = wr('Hall');
    const toEast = wl(cor, 'E', east);
    const hallEast = wl(hall, 'E', cor); // hall east leads to the corridor (room 3)
    const twin = wr('Twin');
    const stranger = wr('Nowhere Special');
    const { report, map } = reconcileWalked(base, walkedMap([cor, east, hall, twin, stranger], [toEast, hallEast]));
    expect(report).toMatchObject({ walkedRooms: 5, matched: 2, ambiguous: 2, unmatched: 1, unmatchedTitles: ['Nowhere Special'], agree: 1 });
    expect(link(map, 'ml1-e').traversals).toBe(1); // matched by the door that was walked
    expect(link(map, 'ml3-e').traversals).toBe(0); // its far end was ambiguous, so the walk is not used
  });

  it('reports a walk that the files contradict, and an exit the files lack, without changing the map', () => {
    const hall = wr('Hall');
    const library = wr('Library');
    const corridor = wr('Corridor', { W: 'x', E: 'y' });
    const wrong = wl(hall, 'N', corridor); // files: hall north leads to the library
    const missing = wl(library, 'E', hall); // files: the library has no east exit
    const { map, report } = reconcileWalked(base, walkedMap([hall, library, corridor], [wrong, missing]));
    expect(report.disagree).toBe(2);
    expect(report.disagreements).toEqual([
      { vnum: 1, dir: 'N', walkedTo: 3, filesSay: 2 },
      { vnum: 2, dir: 'E', walkedTo: 1, filesSay: 'none' },
    ]);
    expect(map).toEqual(base);
  });

  it('skips walked links that lead nowhere known or touch an unmatched room, and merged-away rooms', () => {
    const hall = wr('Hall');
    const ghost = wr('Ghost');
    const merged: Room = { ...wr('Library'), aliasOf: 'w1' };
    const open = wl(hall, 'N', null);
    const toGhost = wl(hall, 'E', ghost);
    const fromGhost = wl(ghost, 'W', hall);
    const { report } = reconcileWalked(base, walkedMap([hall, ghost, merged], [open, toGhost, fromGhost]));
    expect(report).toMatchObject({ walkedRooms: 2, matched: 1, unmatched: 1, walkedLinks: 0, agree: 0 });
  });

  it('keeps the lists to a cap but counts everything', () => {
    const rooms: Room[] = [];
    for (let i = 0; i < WALKED_REPORT_CAP + 5; i += 1) rooms.push(wr(`Unknown ${i}`));
    const hall = wr('Hall');
    const library = wr('Library');
    const corridor = wr('Corridor', { W: 'x', E: 'y' });
    const links: Link[] = [];
    for (let i = 0; i < WALKED_REPORT_CAP + 5; i += 1) links.push(wl(i % 2 === 0 ? hall : library, i % 2 === 0 ? 'S' : 'W', corridor));
    const { report } = reconcileWalked(base, walkedMap([...rooms, hall, library, corridor], links));
    expect(report.unmatched).toBe(WALKED_REPORT_CAP + 5);
    expect(report.unmatchedTitles).toHaveLength(WALKED_REPORT_CAP);
    expect(report.disagree).toBe(WALKED_REPORT_CAP + 5);
    expect(report.disagreements).toHaveLength(WALKED_REPORT_CAP);
  });
});
