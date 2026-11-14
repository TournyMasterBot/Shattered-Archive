import { emptyBaseline, type Link, type Room } from '../schema.js';
import { latestDate, linkDate, newerWins, reconcileLink, reconcileRoom, roomDate } from './merge.js';

const room = (id: string, extra: Partial<Room> = {}): Room => ({ id, title: 'Hall', exits: {}, sources: [], ...extra });
const link = (extra: Partial<Link> = {}): Link => ({
  id: 'l1',
  from: 'a',
  dir: 'N',
  to: 'b',
  state: 'candidate',
  confidence: 0.3,
  offPage: false,
  traversals: 0,
  reverse: false,
  ...extra,
});

describe('E9: the newest record wins, undated rows lose', () => {
  it('the later day wins, either way round', () => {
    expect(newerWins('2020-01-01', '2024-01-05')).toBe('other');
    expect(newerWins('2024-01-05', '2020-01-01')).toBe('base');
  });

  it('any date beats none, and an undated row never replaces a dated one', () => {
    expect(newerWins(undefined, '1999-01-01')).toBe('other');
    expect(newerWins('1999-01-01', undefined)).toBe('base');
    expect(newerWins('', '2020-01-01')).toBe('other');
  });

  it('a tie, or two undated rows, leave the base alone', () => {
    expect(newerWins('2024-01-05', '2024-01-05')).toBe('base');
    expect(newerWins(undefined, undefined)).toBe('base');
  });

  it('a timestamp counts as its day', () => {
    expect(newerWins('2024-01-05', '2024-01-05T23:59:59Z')).toBe('base');
    expect(newerWins('2024-01-05T00:00:01Z', '2024-01-06')).toBe('other');
  });

  it('latestDate is the latest day among those given, ignoring blanks', () => {
    expect(latestDate('2020-02-01', undefined, '2024-01-05T10:00:00Z', '')).toBe('2024-01-05');
    expect(latestDate()).toBeUndefined();
    expect(latestDate(undefined, '')).toBeUndefined();
  });

  it('a room is as old as its newest source or its last visit; a link as its last walk or its sources', () => {
    const baseline = { ...emptyBaseline(), visits: 2, days: ['2026-11-01', '2026-11-05'] };
    expect(roomDate(room('r', { sources: [{ kind: 'azah', date: '2020-01-01' }], baseline }))).toBe('2026-11-05');
    expect(roomDate(room('r', { sources: [{ kind: 'azah', date: '2024-01-05' }] }))).toBe('2024-01-05');
    expect(roomDate(room('r', { sources: [{ kind: 'azah' }] }))).toBeUndefined();
    expect(linkDate(link({ lastWalked: '2026-11-02', sources: [{ kind: 'azah', date: '2020-01-01' }] }))).toBe(
      '2026-11-02',
    );
    expect(linkDate(link())).toBeUndefined();
  });
});

describe('reconcileRoom', () => {
  const walked = room('r1', {
    title: 'Hall of Lanterns',
    sector: 'inside',
    description: 'Walked text.',
    coords: { x: 1, y: 1, z: 0 },
    sources: [{ kind: 'walked', date: '2026-11-05' }],
    exits: { N: 'l-n' },
  });
  const azah = room('az9', {
    title: 'Lantern Hall',
    description: 'Community text.',
    coords: { x: 4, y: 4, z: 0 },
    sources: [{ kind: 'azah', ref: '9', credit: 'Azah', date: '2020-02-01' }],
  });

  it("takes the facts of the newer record and keeps the base's identity, exits and history", () => {
    const merged = reconcileRoom(walked, azah);
    expect(merged).toMatchObject({
      id: 'r1',
      title: 'Hall of Lanterns',
      description: 'Walked text.',
      coords: { x: 1, y: 1, z: 0 },
      exits: { N: 'l-n' },
      sector: 'inside',
    });
    expect(merged.sources).toEqual([...walked.sources, ...azah.sources]);
  });

  it('lets a newer other record win, but fills what it lacks from the older one', () => {
    const newerAzah = room('az9', { title: 'Lantern Hall', sources: [{ kind: 'azah', date: '2027-01-01' }] }); // no sector, description or coordinates
    const merged = reconcileRoom(walked, newerAzah);
    expect(merged).toMatchObject({
      id: 'r1',
      title: 'Lantern Hall',
      sector: 'inside',
      description: 'Walked text.',
      coords: { x: 1, y: 1, z: 0 },
    });
  });

  it('an undated record loses to a dated one, whichever is the base', () => {
    const undated = room('az9', { title: 'Undated Hall', description: 'Undated text.', sources: [{ kind: 'azah' }] });
    expect(reconcileRoom(walked, undated)).toMatchObject({ title: 'Hall of Lanterns', description: 'Walked text.' });
    expect(reconcileRoom(undated, walked)).toMatchObject({
      id: 'az9',
      title: 'Hall of Lanterns',
      description: 'Walked text.',
    });
  });

  it('two undated records leave the base as it was, and a tie keeps the base', () => {
    const a = room('a', { title: 'A', sources: [{ kind: 'azah' }] });
    const b = room('b', { title: 'B', sources: [{ kind: 'azah' }] });
    expect(reconcileRoom(a, b).title).toBe('A');
    const sameDay = room('c', { title: 'C', sources: [{ kind: 'azah', date: '2026-11-05T01:00:00Z' }] });
    expect(reconcileRoom(walked, sameDay).title).toBe('Hall of Lanterns');
  });

  it('keeps the older title when the newer one is empty, and does not repeat a source', () => {
    const blank = room('az9', {
      title: '',
      sources: [
        { kind: 'walked', date: '2026-11-05' },
        { kind: 'azah', date: '2030-01-01' },
      ],
    });
    const merged = reconcileRoom(walked, blank);
    expect(merged.title).toBe('Hall of Lanterns');
    expect(merged.sources).toHaveLength(2);
  });

  it('never changes either record', () => {
    const copy = JSON.stringify([walked, azah]);
    reconcileRoom(walked, azah);
    reconcileRoom(azah, walked);
    expect(JSON.stringify([walked, azah])).toBe(copy);
  });

  it('caps the sources it joins', () => {
    const many = (kind: 'azah' | 'walked'): Room['sources'] =>
      Array.from({ length: 12 }, (_, i) => ({ kind, ref: `${kind}${i}` }));
    expect(
      reconcileRoom(room('a', { sources: many('azah') }), room('b', { sources: many('walked') })).sources,
    ).toHaveLength(16);
  });
});

describe('reconcileLink', () => {
  it('different targets: the newer record wins whole, and the base id stays', () => {
    const walkedLink = link({
      id: 'lw',
      to: 'x',
      state: 'confirmed',
      confidence: 0.95,
      lastWalked: '2026-11-05',
      reverse: true,
      traversals: 2,
    });
    const azahLink = link({
      id: 'azl1',
      to: 'y',
      sources: [{ kind: 'azah', ref: '1', credit: 'Azah', date: '2020-01-01' }],
    });
    expect(reconcileLink(walkedLink, azahLink)).toMatchObject({
      id: 'lw',
      to: 'x',
      state: 'confirmed',
      confidence: 0.95,
    });
    const newerAzah = link({ id: 'azl1', to: 'y', sources: [{ kind: 'azah', date: '2027-01-01' }] });
    expect(reconcileLink(walkedLink, newerAzah)).toMatchObject({ id: 'lw', to: 'y', confidence: 0.3 });
  });

  it('different targets and no dates: the base stays', () => {
    expect(reconcileLink(link({ to: 'x' }), link({ id: 'o', to: 'y' })).to).toBe('x');
  });

  it('an exit with no known target never beats one with a target, whatever its date', () => {
    const known = link({ to: 'x', sources: [{ kind: 'azah', date: '2001-01-01' }] });
    const unknown = link({ id: 'u', to: null, state: 'unknown-target', confidence: 0, lastWalked: '2026-11-05' });
    expect(reconcileLink(known, unknown).to).toBe('x');
    expect(reconcileLink(unknown, known)).toMatchObject({ id: 'u', to: 'x', state: 'candidate' }); // the base id stays
  });

  it('the same target: the more confident state, the latest walk, the larger count, either direction of evidence', () => {
    const walkedLink = link({
      id: 'lw',
      to: 'x',
      state: 'confirmed',
      confidence: 0.95,
      traversals: 3,
      lastWalked: '2026-11-05',
      reverse: false,
    });
    const azahLink = link({
      id: 'azl',
      to: 'x',
      confidence: 0.4,
      traversals: 0,
      reverse: true,
      sources: [{ kind: 'azah', ref: '7', credit: 'Azah' }],
    });
    const merged = reconcileLink(azahLink, walkedLink);
    expect(merged).toMatchObject({
      id: 'azl',
      to: 'x',
      state: 'confirmed',
      confidence: 0.95,
      traversals: 3,
      reverse: true,
      lastWalked: '2026-11-05',
    });
    expect(merged.sources).toEqual(azahLink.sources);
    expect(reconcileLink(walkedLink, azahLink)).toMatchObject({
      id: 'lw',
      state: 'confirmed',
      confidence: 0.95,
      reverse: true,
    });
  });

  it('a link at another slot is not a record of the same exit: the base is returned', () => {
    const base = link();
    expect(reconcileLink(base, link({ dir: 'S', to: 'z' }))).toBe(base);
    expect(reconcileLink(base, link({ from: 'other' }))).toBe(base);
  });

  it('keeps no sources key when neither record has any, and never changes its inputs', () => {
    const a = link({ to: 'x' });
    const b = link({ id: 'o', to: 'x', confidence: 0.4 });
    const copy = JSON.stringify([a, b]);
    const merged = reconcileLink(a, b);
    expect(merged).not.toHaveProperty('sources');
    expect(JSON.stringify([a, b])).toBe(copy);
  });
});
