import type { Direction, Link, LinkState, MapFile, Room } from '../schema.js';
import { verifyAgainstWalked } from './verify.js';

interface Spec {
  id: string;
  title: string;
  desc?: string;
  /** direction -> id of the room it leads to */
  exits?: Partial<Record<Direction, string>>;
  visits?: number;
  aliasOf?: string;
  state?: LinkState;
}

const LONG = 'A vast and empty desert of yellow and white sand surrounds you, and there is nothing else to see for a very long way in any direction.';

function mk(specs: Spec[], area = 'a1'): MapFile {
  const rooms: Room[] = [];
  const links: Link[] = [];
  for (const s of specs) {
    const exits: Partial<Record<Direction, string>> = {};
    for (const [dir, to] of Object.entries(s.exits ?? {}) as [Direction, string][]) {
      const id = `l-${s.id}-${dir}`;
      exits[dir] = id;
      links.push({ id, from: s.id, dir, to, state: s.state ?? 'candidate', confidence: 0.4, offPage: false, traversals: 0, reverse: false });
    }
    const room: Room = { id: s.id, title: s.title, exits, sources: [] };
    if (s.desc !== undefined) room.description = s.desc;
    if (s.visits !== undefined) room.baseline = { visits: s.visits, days: [], contents: [], was: [] };
    if (s.aliasOf !== undefined) room.aliasOf = s.aliasOf;
    rooms.push(room);
  }
  return { version: 1, continents: [{ id: 'c1', name: 'C', areas: [{ id: area, name: 'A', placement: null, subzones: [{ id: 's1', name: 'S', kind: 'consistent', rooms }] }] }], links };
}

describe('verifyAgainstWalked: rooms', () => {
  it('ties a walked room to the Azah room with the same title, description and exits, and agrees the link', () => {
    const azah = mk([
      { id: 'a1', title: 'Hall', desc: 'A long hall.', exits: { N: 'a2' } },
      { id: 'a2', title: 'Study', desc: 'A quiet study.', exits: { S: 'a1' } },
    ]);
    const walked = mk([
      { id: 'w1', title: 'Hall', desc: 'A  long\nhall.', exits: { N: 'w2' }, visits: 4 },
      { id: 'w2', title: 'study', desc: 'A quiet study.', exits: { S: 'w1' }, visits: 2 },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.rooms.a1).toEqual({ verdict: 'verified', quality: 'exact', visits: 4 });
    expect(report.rooms.a2).toMatchObject({ verdict: 'verified', visits: 2 });
    expect(report.links).toEqual({ 'l-a1-N': 'agree', 'l-a2-S': 'agree' });
    expect(report.walkedToAzah).toEqual({ w1: 'a1', w2: 'a2' });
    expect(report.counts).toMatchObject({
      azahRooms: 2,
      azahLinks: 2,
      walkedRooms: 2,
      walkedLinks: 2,
      walkedUnique: 2,
      walkedUnmatched: 0,
      walkedAmbiguous: 0,
      walkedWithoutDescription: 0,
      rooms: { verified: 2, 'verified-differs': 0, ambiguous: 0, unverified: 0 },
      links: { agree: 2, disagree: 0, unverified: 0 },
      quality: { exact: 2, prefix: 0, title: 0 },
    });
    expect(report.byArea).toEqual({ a1: { rooms: 2, verified: 2, verifiedDiffers: 0, ambiguous: 0, unverified: 0 } });
  });

  it('a description that differs only after the first characters is a prefix tie, marked as a difference', () => {
    const azah = mk([{ id: 'a1', title: 'Dunes', desc: `${LONG} Old text at the end.` }]);
    const walked = mk([{ id: 'w1', title: 'Dunes', desc: `${LONG} New text at the end.` }]);
    expect(verifyAgainstWalked(azah, walked).rooms.a1).toMatchObject({ verdict: 'verified-differs', quality: 'prefix', differs: ['description'] });
  });

  it('a description rewritten from its start falls back to the title, and only a unique title is tied', () => {
    const azah = mk([
      { id: 'a1', title: 'Old Bridge', desc: 'The planks creak.' },
      { id: 'a2', title: 'Hall', desc: 'One.' },
      { id: 'a3', title: 'Hall', desc: 'Two.' },
    ]);
    const walked = mk([
      { id: 'w1', title: 'Old Bridge', desc: 'The stones are slick.' },
      { id: 'w2', title: 'Hall', desc: 'Something else entirely.' },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.rooms.a1).toMatchObject({ verdict: 'verified-differs', quality: 'title', differs: ['description'] });
    expect(report.rooms.a2.verdict).toBe('ambiguous');
    expect(report.rooms.a3.verdict).toBe('ambiguous');
    expect(report.counts).toMatchObject({ walkedUnique: 1, walkedAmbiguous: 1 });
  });

  it('a walked room with no description can only be tied by its title, and counts as one', () => {
    const azah = mk([{ id: 'a1', title: 'Cellar', desc: 'Damp.' }]);
    const walked = mk([{ id: 'w1', title: 'Cellar' }]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.rooms.a1).toMatchObject({ verdict: 'verified', quality: 'title' });
    expect(report.counts).toMatchObject({ walkedWithoutDescription: 1, quality: { exact: 0, prefix: 0, title: 1 } });
  });

  it('a room Azah has no title for is unmatched, and an Azah room nobody walked is unverified', () => {
    const azah = mk([{ id: 'a1', title: 'Cellar', desc: 'Damp.' }]);
    const walked = mk([{ id: 'w1', title: 'New Wing', desc: 'Built since.' }]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.rooms.a1).toEqual({ verdict: 'unverified' });
    expect(report.counts).toMatchObject({ walkedUnmatched: 1, rooms: { unverified: 1 } });
  });

  it('prefers the Azah room with the same exits, then one with more, and flags a difference in exits', () => {
    const azah = mk([
      { id: 'a1', title: 'Gate', desc: 'Iron.', exits: { N: 'a9', E: 'a9' } },
      { id: 'a2', title: 'Gate', desc: 'Iron.', exits: { N: 'a9' } },
      { id: 'a3', title: 'Gate', desc: 'Iron.', exits: { S: 'a9' } },
      { id: 'a9', title: 'Far', desc: 'Far.' },
    ]);
    const same = verifyAgainstWalked(azah, mk([{ id: 'w1', title: 'Gate', desc: 'Iron.', exits: { N: 'wx' } }, { id: 'wx', title: 'Far', desc: 'Far.' }]));
    expect(same.walkedToAzah.w1).toBe('a2');
    expect(same.rooms.a2.verdict).toBe('verified');

    const more = verifyAgainstWalked(
      mk([
        { id: 'a1', title: 'Gate', desc: 'Iron.', exits: { N: 'a9', E: 'a9' } },
        { id: 'a3', title: 'Gate', desc: 'Iron.', exits: { S: 'a9' } },
        { id: 'a9', title: 'Far', desc: 'Far.' },
      ]),
      mk([{ id: 'w1', title: 'Gate', desc: 'Iron.', exits: { N: 'wx' } }, { id: 'wx', title: 'Far', desc: 'Far.' }]),
    );
    expect(more.walkedToAzah.w1).toBe('a1');
    expect(more.rooms.a1).toMatchObject({ verdict: 'verified-differs', differs: ['exits'] });
  });
});

describe('verifyAgainstWalked: neighbours narrow ambiguous rooms', () => {
  // three identical desert rooms; only the first has the oasis to its east
  const azah = mk([
    { id: 'd1', title: 'Desert', desc: LONG, exits: { E: 'oa' } },
    { id: 'd2', title: 'Desert', desc: LONG, exits: { E: 'd3' } },
    { id: 'd3', title: 'Desert', desc: LONG, exits: { E: 'd1' } },
    { id: 'oa', title: 'Oasis', desc: 'Palms.' },
  ]);
  const walked = mk([
    { id: 'w1', title: 'Desert', desc: LONG, exits: { E: 'w2' } },
    { id: 'w2', title: 'Oasis', desc: 'Palms.' },
  ]);

  it('the room next to the oasis is the one whose east exit leads to the oasis', () => {
    const report = verifyAgainstWalked(azah, walked);
    expect(report.walkedToAzah).toEqual({ w1: 'd1', w2: 'oa' });
    expect(report.rooms.d1.verdict).toBe('verified');
    expect(report.rooms.d2.verdict).toBe('unverified');
    expect(report.links['l-d1-E']).toBe('agree');
    expect(report.links['l-d2-E']).toBe('unverified');
  });

  it('with no narrowing rounds the room stays ambiguous and proves nothing', () => {
    const report = verifyAgainstWalked(azah, walked, { maxPasses: 0 });
    expect(report.rooms.d1.verdict).toBe('ambiguous');
    expect(report.rooms.d3.verdict).toBe('ambiguous');
    expect(report.counts).toMatchObject({ walkedAmbiguous: 1, walkedUnique: 1 });
    expect(report.walkedToAzah).toEqual({ w2: 'oa' });
  });

  it('identical rooms with nothing to tell them apart stay ambiguous after the rounds', () => {
    const twins = mk([
      { id: 't1', title: 'Desert', desc: LONG },
      { id: 't2', title: 'Desert', desc: LONG },
    ]);
    const report = verifyAgainstWalked(twins, mk([{ id: 'w1', title: 'Desert', desc: LONG }]));
    expect(report.rooms.t1.verdict).toBe('ambiguous');
    expect(report.rooms.t2.verdict).toBe('ambiguous');
  });
});

describe('verifyAgainstWalked: links and disagreements', () => {
  it('an exit the walk found that Azah lacks is counted and sampled, never invented into Azah', () => {
    const azah = mk([
      { id: 'a1', title: 'Hall', desc: 'Hall.', exits: { N: 'a2' } },
      { id: 'a2', title: 'Study', desc: 'Study.' },
      { id: 'a3', title: 'Attic', desc: 'Attic.' },
    ]);
    const walked = mk([
      { id: 'w1', title: 'Hall', desc: 'Hall.', exits: { N: 'w2', U: 'w3' } },
      { id: 'w2', title: 'Study', desc: 'Study.' },
      { id: 'w3', title: 'Attic', desc: 'Attic.' },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.counts.disagreements).toEqual({ 'target-differs': 0, 'azah-lacks-exit': 1, 'walked-conflict': 0 });
    expect(report.samples).toEqual([{ class: 'azah-lacks-exit', azahRoom: 'a1', dir: 'U', from: 'Hall', walkedTo: 'Attic' }]);
    expect(report.links).toEqual({ 'l-a1-N': 'agree' });
    expect(report.rooms.a1.differs).toEqual(['exits']);
  });

  it('the same exit leading to different rooms is a disagreement, with both titles', () => {
    const azah = mk([
      { id: 'a1', title: 'Hall', desc: 'Hall.', exits: { N: 'a3' } },
      { id: 'a2', title: 'Study', desc: 'Study.' },
      { id: 'a3', title: 'Vault', desc: 'Vault.' },
    ]);
    const walked = mk([
      { id: 'w1', title: 'Hall', desc: 'Hall.', exits: { N: 'w2' } },
      { id: 'w2', title: 'Study', desc: 'Study.' },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.links['l-a1-N']).toBe('disagree');
    expect(report.counts.links).toEqual({ agree: 0, disagree: 1, unverified: 0 });
    expect(report.samples).toEqual([{ class: 'target-differs', azahRoom: 'a1', dir: 'N', from: 'Hall', azahTo: 'Vault', walkedTo: 'Study' }]);
  });

  it('an Azah exit with no target is a disagreement without an Azah title; one that is agreed elsewhere stays agreed', () => {
    const azah: MapFile = mk([
      { id: 'a1', title: 'Hall', desc: 'Hall.', exits: { N: 'a2' } },
      { id: 'a2', title: 'Study', desc: 'Study.' },
    ]);
    azah.links[0] = { ...azah.links[0], to: null, state: 'unknown-target' };
    const walked = mk([
      { id: 'w1', title: 'Hall', desc: 'Hall.', exits: { N: 'w2' } },
      { id: 'w2', title: 'Study', desc: 'Study.' },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.links['l-a1-N']).toBe('disagree');
    expect(report.samples[0]).toEqual({ class: 'target-differs', azahRoom: 'a1', dir: 'N', from: 'Hall', walkedTo: 'Study' });

    // two walked rooms tie to the same Azah room: one agrees, one disagrees: agreed stays
    const twice = verifyAgainstWalked(
      mk([
        { id: 'a1', title: 'Hall', desc: 'Hall.', exits: { N: 'a2' } },
        { id: 'a2', title: 'Study', desc: 'Study.' },
        { id: 'a3', title: 'Vault', desc: 'Vault.' },
      ]),
      mk([
        { id: 'w1', title: 'Hall', desc: 'Hall.', exits: { N: 'w2' } },
        { id: 'w2', title: 'Study', desc: 'Study.' },
        { id: 'w4', title: 'Hall', desc: 'Hall.', exits: { N: 'w5' } },
        { id: 'w5', title: 'Vault', desc: 'Vault.' },
      ]),
    );
    expect(twice.links['l-a1-N']).toBe('agree');
  });

  it('a walked conflict (the same exit led to different places) is counted, tied or not', () => {
    const azah = mk([{ id: 'a1', title: 'Maze', desc: 'Twisty.', exits: { N: 'a1' } }]);
    const walked = mk([
      { id: 'w1', title: 'Maze', desc: 'Twisty.', exits: { N: 'w1' }, state: 'conflict' },
      { id: 'w2', title: 'Elsewhere', desc: 'Nowhere in Azah.', exits: { S: 'w2' }, state: 'conflict' },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.counts.disagreements['walked-conflict']).toBe(2);
    expect(report.samples).toEqual([
      { class: 'walked-conflict', dir: 'N', from: 'Maze', azahRoom: 'a1' },
      { class: 'walked-conflict', dir: 'S', from: 'Elsewhere' },
    ]);
  });

  it('keeps at most samplesPerClass examples of a class, but counts them all', () => {
    const azah = mk([
      { id: 'a1', title: 'Hall', desc: 'Hall.' },
      { id: 'a2', title: 'Study', desc: 'Study.' },
    ]);
    const walked = mk([
      { id: 'w1', title: 'Hall', desc: 'Hall.', exits: { N: 'w2', E: 'w2', S: 'w2' } },
      { id: 'w2', title: 'Study', desc: 'Study.' },
    ]);
    const report = verifyAgainstWalked(azah, walked, { samplesPerClass: 2 });
    expect(report.counts.disagreements['azah-lacks-exit']).toBe(3);
    expect(report.samples).toHaveLength(2);
  });

  it('follows a merged-away walked room to the room that absorbed it, and ignores a walked exit to nowhere', () => {
    const azah = mk([
      { id: 'a1', title: 'Hall', desc: 'Hall.', exits: { N: 'a2' } },
      { id: 'a2', title: 'Study', desc: 'Study.' },
    ]);
    const walked = mk([
      { id: 'w1', title: 'Hall', desc: 'Hall.', exits: { N: 'wgone', E: 'wmissing' } },
      { id: 'w2', title: 'Study', desc: 'Study.' },
      { id: 'wgone', title: 'Study', desc: 'Study.', aliasOf: 'w2' },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.links['l-a1-N']).toBe('agree');
    expect(report.counts.walkedRooms).toBe(2);
    expect(report.counts.disagreements['azah-lacks-exit']).toBe(0);
  });

  it('a walked exit with no link at all, and an unknown-target one, prove nothing', () => {
    const azah = mk([{ id: 'a1', title: 'Hall', desc: 'Hall.', exits: { N: 'a2' } }, { id: 'a2', title: 'Study', desc: 'Study.' }]);
    const walked = mk([{ id: 'w1', title: 'Hall', desc: 'Hall.', exits: { N: 'w9' }, state: 'unknown-target' }]);
    walked.links[0] = { ...walked.links[0], to: null };
    walked.continents[0].areas[0].subzones[0].rooms[0].exits.E = 'l-missing';
    const report = verifyAgainstWalked(azah, walked);
    expect(report.links['l-a1-N']).toBe('unverified');
    expect(report.counts.walkedLinks).toBe(1);
  });
});

describe('verifyAgainstWalked: several walked rooms for one Azah room, and areas', () => {
  it('sums the visits of walked rooms tied to the same Azah room and lets a clean tie beat a differing one', () => {
    const azah = mk([{ id: 'a1', title: 'Dunes', desc: `${LONG} Old.`, exits: { N: 'a2' } }, { id: 'a2', title: 'Far', desc: 'Far.' }]);
    const walked = mk([
      { id: 'w1', title: 'Dunes', desc: `${LONG} New.`, exits: { N: 'w9' }, visits: 3 },
      { id: 'w2', title: 'Dunes', desc: `${LONG} Old.`, exits: { N: 'w9' }, visits: 5 },
      { id: 'w9', title: 'Far', desc: 'Far.' },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.rooms.a1.verdict).toBe('verified');
    expect(report.rooms.a1.visits).toBe(8);

    // and the other order: a clean tie first, then a differing one: stays verified
    const reversed = verifyAgainstWalked(azah, mk([walked.continents[0].areas[0].subzones[0].rooms[1], walked.continents[0].areas[0].subzones[0].rooms[0], walked.continents[0].areas[0].subzones[0].rooms[2]].map((r) => ({ id: r.id, title: r.title, desc: r.description, visits: r.baseline?.visits, exits: r.id === 'w9' ? {} : { N: 'w9' } }))));
    expect(reversed.rooms.a1.verdict).toBe('verified');
    expect(reversed.rooms.a1.visits).toBe(8);
  });

  it('counts rooms per Azah area', () => {
    const a = mk([{ id: 'a1', title: 'Hall', desc: 'Hall.' }], 'north');
    const b = mk([{ id: 'a2', title: 'Study', desc: 'Study.' }, { id: 'a3', title: 'Attic', desc: 'Attic.' }], 'south');
    const azah: MapFile = { version: 1, continents: [a.continents[0], { ...b.continents[0], id: 'c2' }], links: [] };
    const report = verifyAgainstWalked(azah, mk([{ id: 'w1', title: 'Study', desc: 'Study.' }]));
    expect(report.byArea).toEqual({
      north: { rooms: 1, verified: 0, verifiedDiffers: 0, ambiguous: 0, unverified: 1 },
      south: { rooms: 2, verified: 1, verifiedDiffers: 0, ambiguous: 0, unverified: 1 },
    });
  });

  it('every Azah room gets exactly one verdict (the counts add up)', () => {
    const azah = mk([
      { id: 'a1', title: 'Hall', desc: 'Hall.' },
      { id: 'a2', title: 'Hall', desc: 'Hall.' },
      { id: 'a3', title: 'Study', desc: 'Study.' },
      { id: 'a4', title: 'Attic', desc: 'Attic.' },
    ]);
    const report = verifyAgainstWalked(azah, mk([{ id: 'w1', title: 'Hall', desc: 'Hall.' }, { id: 'w2', title: 'Study', desc: 'Study.' }]));
    const sum = Object.values(report.counts.rooms).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.counts.azahRooms);
    expect(report.counts.rooms).toEqual({ verified: 1, 'verified-differs': 0, ambiguous: 2, unverified: 1 });
  });
});

describe('verifyAgainstWalked: what is skipped and what is left alone', () => {
  it('ignores an Azah room that was merged into another, and an Azah room with no description is tied by title only', () => {
    const azah = mk([
      { id: 'a1', title: 'Hall', desc: 'Hall.' },
      { id: 'a2', title: 'Hall', aliasOf: 'a1' },
      { id: 'a3', title: 'Cellar' },
    ]);
    const report = verifyAgainstWalked(azah, mk([{ id: 'w1', title: 'Cellar', desc: 'Damp.' }]));
    expect(report.counts.azahRooms).toBe(2);
    expect(report.rooms.a3).toMatchObject({ verdict: 'verified-differs', quality: 'title' });
  });

  it('narrowing skips an exit whose far end is unmatched or whose Azah link has no target, and still decides on the rest', () => {
    const azah = mk([
      { id: 't1', title: 'Crossroads', desc: LONG, exits: { E: 'ox', N: 'ox' } },
      { id: 't2', title: 'Crossroads', desc: LONG, exits: { E: 'ox', N: 'ox' } },
      { id: 'ox', title: 'Oasis', desc: 'Palms.' },
    ]);
    azah.links.find((l) => l.id === 'l-t2-E')!.to = null;
    azah.links.find((l) => l.id === 'l-t2-E')!.state = 'unknown-target';
    const walked = mk([
      { id: 'w1', title: 'Crossroads', desc: LONG, exits: { E: 'w2', N: 'w3' } },
      { id: 'w2', title: 'Oasis', desc: 'Palms.' },
      { id: 'w3', title: 'A place Azah never drew', desc: 'Unknown.' },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.walkedToAzah.w1).toBe('t1');
  });

  it('a verified room next to an ambiguous one proves nothing about the exit between them', () => {
    const azah = mk([
      { id: 'a1', title: 'Hall', desc: 'Hall.', exits: { N: 't1' } },
      { id: 't1', title: 'Desert', desc: LONG },
      { id: 't2', title: 'Desert', desc: LONG },
    ]);
    const walked = mk([
      { id: 'w1', title: 'Hall', desc: 'Hall.', exits: { N: 'w2' } },
      { id: 'w2', title: 'Desert', desc: LONG },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.rooms.a1.verdict).toBe('verified');
    expect(report.links['l-a1-N']).toBe('unverified');
    expect(report.counts.disagreements).toEqual({ 'target-differs': 0, 'azah-lacks-exit': 0, 'walked-conflict': 0 });
  });
});

describe('verifyAgainstWalked: exits Azah does not have at all', () => {
  it('twins that both lack the walked exit stay ambiguous (no exit to narrow by)', () => {
    const azah = mk([
      { id: 't1', title: 'Crossroads', desc: LONG, exits: { E: 'ox' } },
      { id: 't2', title: 'Crossroads', desc: LONG, exits: { N: 'ox' } },
      { id: 'ox', title: 'Oasis', desc: 'Palms.' },
    ]);
    const walked = mk([
      { id: 'w1', title: 'Crossroads', desc: LONG, exits: { W: 'w2' } },
      { id: 'w2', title: 'Oasis', desc: 'Palms.' },
    ]);
    const report = verifyAgainstWalked(azah, walked);
    expect(report.rooms.t1.verdict).toBe('ambiguous');
    expect(report.rooms.t2.verdict).toBe('ambiguous');
  });
});
