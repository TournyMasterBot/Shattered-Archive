import { CONFIRMED_CONFIDENCE, SINGLE_TRAVERSAL_CONFIDENCE } from '../identity.js';
import { LIMITS, type Direction, type Link, type MapFile, type Room } from '../schema.js';
import { validateMapFile } from '../validate.js';
import { applyTrace } from './apply.js';
import type { LinkEvidence } from './trace.js';

function mk(specs: { id: string; exits?: Partial<Record<Direction, string>> }[]): MapFile {
  const links: Link[] = [];
  const rooms: Room[] = specs.map((s) => {
    const exits: Partial<Record<Direction, string>> = {};
    for (const [dir, to] of Object.entries(s.exits ?? {}) as [Direction, string][]) {
      const id = `l-${s.id}-${dir.toLowerCase()}`;
      exits[dir] = id;
      links.push({ id, from: s.id, dir, to, state: 'candidate', confidence: 0.4, offPage: false, traversals: 0, reverse: false, sources: [{ kind: 'azah', ref: id, credit: 'Azah', date: '2020-01-01' }] });
    }
    return { id: s.id, title: `Room ${s.id}`, exits, sources: [{ kind: 'azah', ref: s.id, credit: 'Azah', date: '2020-01-01' }] };
  });
  return { version: 1, continents: [{ id: 'c1', name: 'C', areas: [{ id: 'a1', name: 'A', placement: null, subzones: [{ id: 's1', name: 'S', kind: 'consistent', rooms }] }] }], links };
}

const ev = (agree: number, lastDay = '2026-07-03', disagree = 0, seenTo: string[] = []): LinkEvidence => ({ agree, disagree, lastDay, seenTo });
const roomsOf = (map: MapFile): Room[] => map.continents[0].areas[0].subzones[0].rooms;
const linkOf = (map: MapFile, id: string): Link => map.links.find((l) => l.id === id) as Link;

describe('applyTrace', () => {
  const azah = mk([{ id: 'r1', exits: { N: 'r2', E: 'r3' } }, { id: 'r2', exits: { S: 'r1' } }, { id: 'r3' }, { id: 'r4', exits: { N: 'r1' } }]);

  it('a link walked one way is a candidate at 0.6, with the steps and the day', () => {
    const { map, counts } = applyTrace(azah, { links: { 'l-r1-e': 'agree' }, evidence: { 'l-r1-e': ev(3, '2026-07-05') }, walkedOn: {} }, { date: '2026-11-11' });
    expect(linkOf(map, 'l-r1-e')).toMatchObject({ state: 'candidate', confidence: SINGLE_TRAVERSAL_CONFIDENCE, reverse: false, traversals: 3, lastWalked: '2026-07-05' });
    expect(linkOf(map, 'l-r1-e').sources).toEqual([{ kind: 'azah', ref: 'l-r1-e', credit: 'Azah', date: '2020-01-01' }, { kind: 'walked', date: '2026-07-05' }]);
    expect(counts).toEqual({ roomsWalked: 0, linksConfirmed: 0, linksWalkedOnce: 1, linksConflict: 0, linksUntouched: 3 });
    expect(map.generatedAt).toBe('2026-11-11');
  });

  it('a link walked both ways is confirmed on both ends, a one-way agreement beside it is not', () => {
    const { map, counts } = applyTrace(
      azah,
      { links: { 'l-r1-n': 'agree', 'l-r2-s': 'agree', 'l-r4-n': 'agree' }, evidence: { 'l-r1-n': ev(2), 'l-r2-s': ev(1, '2026-07-04'), 'l-r4-n': ev(1) }, walkedOn: {} },
      { date: '2026-11-11' },
    );
    expect(linkOf(map, 'l-r1-n')).toMatchObject({ state: 'confirmed', confidence: CONFIRMED_CONFIDENCE, reverse: true, traversals: 2 });
    expect(linkOf(map, 'l-r2-s')).toMatchObject({ state: 'confirmed', confidence: CONFIRMED_CONFIDENCE, reverse: true, lastWalked: '2026-07-04' });
    // r4 -> r1 north: r1's south exit does not exist, so there is no way back
    expect(linkOf(map, 'l-r4-n')).toMatchObject({ state: 'candidate', confidence: SINGLE_TRAVERSAL_CONFIDENCE, reverse: false });
    expect(counts).toMatchObject({ linksConfirmed: 2, linksWalkedOnce: 1 });
  });

  it('a way back that leads somewhere else does not confirm', () => {
    const odd = mk([{ id: 'r1', exits: { N: 'r2' } }, { id: 'r2', exits: { S: 'r4' } }, { id: 'r4' }]);
    const { map } = applyTrace(odd, { links: { 'l-r1-n': 'agree', 'l-r2-s': 'agree' }, evidence: { 'l-r1-n': ev(1), 'l-r2-s': ev(1) }, walkedOn: {} }, { date: '2026-11-11' });
    expect(linkOf(map, 'l-r1-n')).toMatchObject({ state: 'candidate', reverse: false });
  });

  it('a way back that did not agree does not confirm', () => {
    const { map } = applyTrace(azah, { links: { 'l-r1-n': 'agree', 'l-r2-s': 'disagree' }, evidence: { 'l-r1-n': ev(1), 'l-r2-s': ev(0, '2026-07-04', 1) }, walkedOn: {} }, { date: '2026-11-11' });
    expect(linkOf(map, 'l-r1-n')).toMatchObject({ state: 'candidate', reverse: false });
  });

  it('a link whose steps ended elsewhere is a conflict that names where the walk went', () => {
    const { map, counts } = applyTrace(azah, { links: { 'l-r1-n': 'disagree' }, evidence: { 'l-r1-n': ev(0, '2026-07-06', 2, ['r3', 'r4']) }, walkedOn: {} }, { date: '2026-11-11' });
    expect(linkOf(map, 'l-r1-n')).toMatchObject({ state: 'conflict', confidence: 0, traversals: 2, lastWalked: '2026-07-06', conflictTo: ['r3', 'r4'] });
    expect(counts.linksConflict).toBe(1);
    // a conflict with no room named is still a conflict, and names none
    const bare = applyTrace(azah, { links: { 'l-r1-n': 'disagree' }, evidence: { 'l-r1-n': ev(0, '2026-07-06', 1) }, walkedOn: {} }, { date: '2026-11-11' });
    expect(linkOf(bare.map, 'l-r1-n')).not.toHaveProperty('conflictTo');
    // at most the schema's number of rooms
    const many = applyTrace(azah, { links: { 'l-r1-n': 'disagree' }, evidence: { 'l-r1-n': ev(0, '2026-07-06', 1, Array.from({ length: 12 }, (_, i) => `x${i}`)) }, walkedOn: {} }, { date: '2026-11-11' });
    expect(linkOf(many.map, 'l-r1-n').conflictTo).toHaveLength(LIMITS.maxConflictTargets);
  });

  it('a walked room gets a walked source; unwalked rooms and links stay exactly as imported', () => {
    const { map, counts } = applyTrace(azah, { links: {}, evidence: {}, walkedOn: { r1: { first: '2026-07-03', last: '2026-07-09' } } }, { date: '2026-11-11' });
    expect(roomsOf(map)[0].sources).toEqual([{ kind: 'azah', ref: 'r1', credit: 'Azah', date: '2020-01-01' }, { kind: 'walked', date: '2026-07-09' }]);
    expect(roomsOf(map)[1].sources).toHaveLength(1);
    expect(counts).toMatchObject({ roomsWalked: 1, linksUntouched: 4 });
    expect(map.links.map((l) => [l.id, l.state, l.confidence])).toEqual(azah.links.map((l) => [l.id, l.state, l.confidence]));
  });

  it('never adds to a record that already holds the most sources the schema allows', () => {
    const full = mk([{ id: 'r1' }]);
    roomsOf(full)[0].sources = Array.from({ length: LIMITS.maxSources }, (_, i) => ({ kind: 'manual' as const, ref: `m${i}` }));
    const { map, counts } = applyTrace(full, { links: {}, evidence: {}, walkedOn: { r1: { first: '2026-07-03', last: '2026-07-09' } } }, { date: '2026-11-11' });
    expect(roomsOf(map)[0].sources).toHaveLength(LIMITS.maxSources);
    expect(counts.roomsWalked).toBe(0);
  });

  it('keeps the newest sources of a link that already holds many, and a link with none gets one', () => {
    const base = mk([{ id: 'r1', exits: { N: 'r2' } }, { id: 'r2' }]);
    linkOf(base, 'l-r1-n').sources = Array.from({ length: LIMITS.maxSources }, (_, i) => ({ kind: 'manual' as const, ref: `m${i}` }));
    const { map } = applyTrace(base, { links: { 'l-r1-n': 'agree' }, evidence: { 'l-r1-n': ev(1) }, walkedOn: {} }, { date: '2026-11-11' });
    expect(linkOf(map, 'l-r1-n').sources).toHaveLength(LIMITS.maxSources);
    expect(linkOf(map, 'l-r1-n').sources?.at(-1)).toEqual({ kind: 'walked', date: '2026-07-03' });

    const bare = mk([{ id: 'r1', exits: { N: 'r2' } }, { id: 'r2' }]);
    delete linkOf(bare, 'l-r1-n').sources;
    expect(linkOf(applyTrace(bare, { links: { 'l-r1-n': 'agree' }, evidence: { 'l-r1-n': ev(1) }, walkedOn: {} }, { date: '2026-11-11' }).map, 'l-r1-n').sources).toEqual([{ kind: 'walked', date: '2026-07-03' }]);
  });

  it('a conflict on a link with no sources gets the walked one', () => {
    const bare = mk([{ id: 'r1', exits: { N: 'r2' } }, { id: 'r2' }]);
    delete linkOf(bare, 'l-r1-n').sources;
    const { map } = applyTrace(bare, { links: { 'l-r1-n': 'disagree' }, evidence: { 'l-r1-n': ev(0, '2026-07-06', 1) }, walkedOn: {} }, { date: '2026-11-11' });
    expect(linkOf(map, 'l-r1-n').sources).toEqual([{ kind: 'walked', date: '2026-07-06' }]);
  });

  it('does not change its input, caps traversals, ignores a verdict with no evidence, and the result passes the strict reader', () => {
    const before = JSON.stringify(azah);
    const { map, counts } = applyTrace(
      azah,
      { links: { 'l-r1-n': 'agree', 'l-r1-e': 'agree', 'l-r2-s': 'disagree' }, evidence: { 'l-r1-n': ev(5_000_000_000), 'l-r2-s': ev(0, '2026-07-04', 1, ['r3']) }, walkedOn: { r2: { first: '2026-07-03', last: '2026-07-03' } } },
      { date: '2026-11-11' },
    );
    expect(JSON.stringify(azah)).toBe(before);
    expect(linkOf(map, 'l-r1-n').traversals).toBe(LIMITS.maxTraversals);
    expect(linkOf(map, 'l-r1-e').state).toBe('candidate');
    expect(linkOf(map, 'l-r1-e').confidence).toBe(0.4);
    expect(counts.linksUntouched).toBeGreaterThan(0);
    const checked = validateMapFile(map);
    expect(checked.ok ? [] : checked.errors).toEqual([]);
  });
});
