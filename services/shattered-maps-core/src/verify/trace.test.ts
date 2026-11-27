import type { Direction, Link, MapFile, Room } from '../schema.js';
import { AzahTracer, type TraceContext, type TraceView } from './trace.js';

interface Spec {
  id: string;
  title: string;
  desc?: string;
  exits?: Partial<Record<Direction, string>>;
  area?: string;
}

const LONG = 'A vast and empty desert of yellow and white sand surrounds you, and there is nothing else to see for a very long way in any direction.';

function mk(specs: Spec[]): MapFile {
  const byArea = new Map<string, Room[]>();
  const links: Link[] = [];
  for (const s of specs) {
    const exits: Partial<Record<Direction, string>> = {};
    for (const [dir, to] of Object.entries(s.exits ?? {}) as [Direction, string][]) {
      const id = `l-${s.id}-${dir}`;
      exits[dir] = id;
      links.push({ id, from: s.id, dir, to, state: 'candidate', confidence: 0.4, offPage: false, traversals: 0, reverse: false });
    }
    const room: Room = { id: s.id, title: s.title, exits, sources: [] };
    if (s.desc !== undefined) room.description = s.desc;
    const list = byArea.get(s.area ?? 'a1') ?? [];
    list.push(room);
    byArea.set(s.area ?? 'a1', list);
  }
  return {
    version: 1,
    continents: [
      {
        id: 'c1',
        name: 'C',
        areas: [...byArea].map(([id, rooms]) => ({ id, name: id, placement: null, subzones: [{ id: `${id}-s`, name: 'S', kind: 'consistent' as const, rooms }] })),
      },
    ],
    links,
  };
}

const ctx = (arrivalDir?: Direction, session = 's1', day = '2026-07-03'): TraceContext => ({ day, session, ...(arrivalDir ? { arrivalDir } : {}) });
const seen = (title: string, desc: string | undefined, exits: Direction[]): TraceView => ({ title, ...(desc === undefined ? {} : { description: desc }), exits });

describe('AzahTracer: following a walk on the map', () => {
  const azah = mk([
    { id: 'a1', title: 'Hall', desc: 'A long hall.', exits: { N: 'a2' } },
    { id: 'a2', title: 'Study', desc: 'A quiet study.', exits: { S: 'a1', E: 'a3' } },
    { id: 'a3', title: 'Attic', desc: 'Dusty.', exits: { W: 'a2' } },
  ]);

  it('a walk along the map verifies its rooms and agrees the links it took', async () => {
    const t = new AzahTracer(azah);
    await t.apply(seen('Hall', 'A  long\nhall.', ['N']), ctx());
    await t.apply(seen('Study', 'A quiet study.', ['S', 'E']), ctx('N'));
    await t.apply(seen('Attic', 'Dusty.', ['W']), ctx('E'));
    const r = t.report();
    expect(r.rooms.a1).toEqual({ verdict: 'verified', quality: 'exact', visits: 1 });
    expect(r.rooms.a3.verdict).toBe('verified');
    expect(r.links).toEqual({ 'l-a1-N': 'agree', 'l-a2-S': 'unverified', 'l-a2-E': 'agree', 'l-a3-W': 'unverified' });
    expect(r.walkedOn.a2).toEqual({ first: '2026-07-03', last: '2026-07-03' });
    expect(r.counts).toMatchObject({
      views: 3,
      localized: 3,
      ambiguous: 0,
      unmatched: 0,
      steps: 2,
      stepsAgree: 2,
      stepsAmbiguous: 0,
      azahRooms: 3,
      azahLinks: 4,
      rooms: { verified: 3, 'verified-differs': 0, ambiguous: 0, unverified: 0 },
      links: { agree: 2, disagree: 0, unverified: 2 },
    });
    expect(r.byArea).toEqual({ a1: { rooms: 3, verified: 3, verifiedDiffers: 0, ambiguous: 0, unverified: 0 } });
    expect(r.unmatchedTitles).toEqual([]);
  });

  it('is an async sink like the world memory (apply resolves ok)', async () => {
    await expect(new AzahTracer(azah).apply(seen('Hall', 'A long hall.', ['N']), ctx())).resolves.toEqual({ ok: true });
  });

  it('a step to a room that is not where Azah says disagrees, and the player is placed again from the view', async () => {
    const t = new AzahTracer(mk([...[{ id: 'a1', title: 'Hall', desc: 'H.', exits: { N: 'a2' } }, { id: 'a2', title: 'Study', desc: 'S.' }, { id: 'a3', title: 'Vault', desc: 'V.' }]]));
    await t.apply(seen('Hall', 'H.', ['N']), ctx());
    await t.apply(seen('Vault', 'V.', []), ctx('N'));
    const r = t.report();
    expect(r.links['l-a1-N']).toBe('disagree');
    expect(r.counts).toMatchObject({ stepsDisagree: 1, relocalized: 1, disagreements: { 'target-differs': 1, 'azah-lacks-exit': 0, 'walked-conflict': 0 } });
    expect(r.samples).toEqual([{ class: 'target-differs', azahRoom: 'a1', dir: 'N', from: 'Hall', azahTo: 'Study', walkedTo: 'Vault' }]);
    expect(r.rooms.a3.verdict).toBe('verified');
  });

  it('a step through an exit Azah lacks is counted and sampled', async () => {
    const t = new AzahTracer(mk([{ id: 'a1', title: 'Hall', desc: 'H.' }, { id: 'a2', title: 'Study', desc: 'S.' }]));
    await t.apply(seen('Hall', 'H.', ['N']), ctx());
    await t.apply(seen('Study', 'S.', []), ctx('N'));
    const r = t.report();
    expect(r.counts).toMatchObject({ stepsNoExit: 1, relocalized: 1, disagreements: { 'target-differs': 0, 'azah-lacks-exit': 1, 'walked-conflict': 0 } });
    expect(r.samples).toEqual([{ class: 'azah-lacks-exit', azahRoom: 'a1', dir: 'N', from: 'Hall', walkedTo: 'Study' }]);
    expect(r.rooms.a1.differs).toEqual(['exits']);
  });

  it('a view no Azah room fits is a room Azah lacks, counted by title; the position is lost', async () => {
    const t = new AzahTracer(azah);
    await t.apply(seen('Hall', 'A long hall.', ['N']), ctx());
    await t.apply(seen('A New Wing', 'Built since.', ['S']), ctx('N'));
    await t.apply(seen('A New Wing', 'Built since.', ['S']), ctx());
    await t.apply(seen('Study', 'A quiet study.', ['S', 'E']), ctx('N'));
    const r = t.report();
    expect(r.unmatchedTitles).toEqual([{ title: 'A New Wing', count: 2 }]);
    expect(r.counts.unmatched).toBe(2);
    // no step was followed at all: the view after the hall is a room Azah does not have, and after it nothing is known about where the player is
    expect(r.counts.steps).toBe(0);
    expect(r.links['l-a1-N']).toBe('unverified');
  });
});

const azahSpecs = (): Spec[] => [
  { id: 'd1', title: 'Desert', desc: LONG, exits: { E: 'd2' } },
  { id: 'd2', title: 'Desert', desc: LONG, exits: { E: 'd3' } },
  { id: 'd3', title: 'Desert', desc: LONG, exits: { E: 'oa' } },
  { id: 'oa', title: 'Oasis', desc: 'Palms.', exits: { W: 'd3' } },
];

describe('AzahTracer: rooms that print the same text', () => {
  const azah = mk(azahSpecs());

  it('a walk toward the oasis localizes the desert rooms one step at a time', async () => {
    const t = new AzahTracer(azah);
    await t.apply(seen('Desert', LONG, ['E']), ctx()); // could be any of the three
    expect(t.report().counts).toMatchObject({ ambiguous: 1, localized: 0 });
    await t.apply(seen('Oasis', 'Palms.', ['W']), ctx('E')); // only d3 leads to the oasis
    const r = t.report();
    expect(r.rooms.oa.verdict).toBe('verified');
    // the origin is only known after the fact, so the step proves the link d3 -> oasis
    expect(r.links['l-d3-E']).toBe('agree');
    expect(r.rooms.d1.verdict).toBe('ambiguous');
    expect(r.counts).toMatchObject({ steps: 1, stepsAgree: 1, stepsAmbiguous: 0 });
  });

  it('a step that several possible rooms could have taken is counted as ambiguous and proves no link', async () => {
    const t = new AzahTracer(azah);
    await t.apply(seen('Desert', LONG, ['E']), ctx());
    await t.apply(seen('Desert', LONG, ['E']), ctx('E')); // d1->d2 or d2->d3
    const r = t.report();
    expect(r.counts).toMatchObject({ stepsAgree: 1, stepsAmbiguous: 1 });
    expect(Object.values(r.links).filter((v) => v === 'agree')).toHaveLength(0);
  });

  it('a step from an unknown position that fits no exit, or that no exit leads to, relocalizes and blames no link', async () => {
    const t = new AzahTracer(azah);
    await t.apply(seen('Desert', LONG, ['E']), ctx()); // d1, d2 or d3
    await t.apply(seen('Study', undefined, []), ctx('E')); // no Azah study: unmatched, position lost
    await t.apply(seen('Desert', LONG, ['E']), ctx());
    // the exits lead to desert or the oasis, never to this view: every origin disagrees, none is blamed
    const vault = new AzahTracer(mk([...azahSpecs(), { id: 'v1', title: 'Vault', desc: 'V.' }]));
    await vault.apply(seen('Desert', LONG, ['E']), ctx());
    await vault.apply(seen('Vault', 'V.', []), ctx('E'));
    expect(vault.report().counts).toMatchObject({ stepsDisagree: 1, relocalized: 1 });
    expect(vault.report().samples).toEqual([]);
    expect(Object.values(vault.report().links).filter((v) => v === 'disagree')).toHaveLength(0);

    // and a direction none of the possible rooms has an exit in
    const north = new AzahTracer(mk([...azahSpecs(), { id: 'v1', title: 'Vault', desc: 'V.' }]));
    await north.apply(seen('Desert', LONG, ['E']), ctx());
    await north.apply(seen('Vault', 'V.', []), ctx('N'));
    expect(north.report().counts).toMatchObject({ stepsNoExit: 1, relocalized: 1 });
    expect(north.report().samples).toEqual([]);
  });

  it('a view that fits more rooms than the credit limit proves nothing about any of them', async () => {
    const many = mk(Array.from({ length: 70 }, (_, i) => ({ id: `m${i}`, title: 'Maze', desc: LONG })));
    const t = new AzahTracer(many);
    await t.apply(seen('Maze', LONG, []), ctx());
    const r = t.report();
    expect(r.counts.rooms).toEqual({ verified: 0, 'verified-differs': 0, ambiguous: 0, unverified: 70 });
    expect(r.counts.ambiguous).toBe(1);
  });

  it('a step from several rooms with an exit of which none leads to the view relocalizes without blaming any link', async () => {
    const t = new AzahTracer(azah);
    await t.apply(seen('Desert', LONG, ['E']), ctx());
    await t.apply(seen('Oasis', 'Palms.', ['W']), ctx('E'));
    await t.apply(seen('Desert', LONG, ['E']), ctx('W')); // the oasis' west exit leads to d3, a desert: fine
    const r = t.report();
    expect(r.links['l-oa-W']).toBe('agree');
    // now a step from the unknown position (three desert rooms) east to a desert: possible, no blame either way
    await t.apply(seen('Desert', LONG, ['E']), ctx());
    await t.apply(seen('Study', undefined, []), ctx('E'));
    expect(t.report().counts.disagreements).toEqual({ 'target-differs': 0, 'azah-lacks-exit': 0, 'walked-conflict': 0 });
    expect(t.report().counts.relocalized).toBe(0);
  });
});

describe('AzahTracer: sessions, refusals and descriptions', () => {
  const azah = mk([
    { id: 'a1', title: 'Hall', desc: 'H.', exits: { N: 'a2' } },
    { id: 'a2', title: 'Study', desc: 'S.', exits: { S: 'a1' } },
  ]);

  it('never follows a step across a session, a refused view or a closed connection', async () => {
    const t = new AzahTracer(azah);
    await t.apply(seen('Hall', 'H.', ['N']), ctx(undefined, 's1'));
    await t.apply(seen('Study', 'S.', ['S']), ctx('N', 's2')); // another session: no step
    expect(t.report().counts.steps).toBe(0);

    await t.apply(seen('Hall', 'H.', ['N']), ctx(undefined, 's2'));
    t.noteRefused();
    await t.apply(seen('Study', 'S.', ['S']), ctx('N', 's2'));
    expect(t.report().counts).toMatchObject({ steps: 0, refused: 1 });

    await t.apply(seen('Hall', 'H.', ['N']), ctx(undefined, 's2'));
    t.endSession();
    await t.apply(seen('Study', 'S.', ['S']), ctx('N', 's2'));
    expect(t.report().counts.steps).toBe(0);
  });

  it('a view without a description is tied by title and exits only, and is not a description difference', async () => {
    const t = new AzahTracer(azah);
    await t.apply(seen('Hall', undefined, ['N']), ctx());
    expect(t.report().rooms.a1).toEqual({ verdict: 'verified', quality: 'title', visits: 1 });
  });

  it('a description that changed after its first characters verifies the room with a note, and a later clean visit makes it verified', async () => {
    const t = new AzahTracer(mk([{ id: 'a1', title: 'Dunes', desc: `${LONG} Old.`, exits: { N: 'a1' } }]));
    await t.apply(seen('Dunes', `${LONG} New.`, ['N']), ctx());
    expect(t.report().rooms.a1).toEqual({ verdict: 'verified-differs', quality: 'prefix', visits: 1, differs: ['description'] });
    await t.apply(seen('Dunes', `${LONG} Old.`, ['N']), ctx(undefined, 's2', '2026-07-05'));
    const r = t.report();
    expect(r.rooms.a1).toEqual({ verdict: 'verified', quality: 'exact', visits: 2 });
    expect(r.walkedOn.a1).toEqual({ first: '2026-07-03', last: '2026-07-05' });
  });

  it('different exits are a difference, and the better quality of two visits is kept', async () => {
    const t = new AzahTracer(mk([{ id: 'a1', title: 'Gate', desc: 'Iron.', exits: { N: 'a1', E: 'a1' } }]));
    await t.apply(seen('Gate', 'Iron.', ['N']), ctx());
    await t.apply(seen('Gate', undefined, ['N']), ctx(undefined, 's2'));
    expect(t.report().rooms.a1).toEqual({ verdict: 'verified-differs', quality: 'exact', visits: 2, differs: ['exits'] });
  });

  it('remembers at most maxUnmatchedTitles titles but keeps counting the ones it has', async () => {
    const t = new AzahTracer(azah, { maxUnmatchedTitles: 1 });
    await t.apply(seen('First', 'x', []), ctx());
    await t.apply(seen('Second', 'x', []), ctx());
    await t.apply(seen('First', 'x', []), ctx());
    expect(t.report().unmatchedTitles).toEqual([{ title: 'First', count: 2 }]);
    expect(t.report().counts.unmatched).toBe(3);
  });

  it('lists unmatched titles most often first, ties in alphabetical order', async () => {
    const t = new AzahTracer(azah);
    for (const title of ['Zeta', 'Alpha', 'Alpha', 'Zeta', 'Mid']) await t.apply(seen(title, 'x', []), ctx());
    expect(t.report().unmatchedTitles).toEqual([
      { title: 'Alpha', count: 2 },
      { title: 'Zeta', count: 2 },
      { title: 'Mid', count: 1 },
    ]);
  });

  it('keeps at most samplesPerClass examples but counts them all', async () => {
    const t = new AzahTracer(mk([{ id: 'a1', title: 'Hall', desc: 'H.' }, { id: 'a2', title: 'Study', desc: 'S.' }]), { samplesPerClass: 1 });
    for (let i = 0; i < 3; i += 1) {
      await t.apply(seen('Hall', 'H.', []), ctx(undefined, `s${i}`));
      await t.apply(seen('Study', 'S.', []), ctx('N', `s${i}`));
    }
    const r = t.report();
    expect(r.counts.disagreements['azah-lacks-exit']).toBe(3);
    expect(r.samples).toHaveLength(1);
  });

  it('a link walked both ways agrees; one that agreed and disagreed stays agreed, one that only disagreed is disagree', async () => {
    const m = mk([
      { id: 'a1', title: 'Hall', desc: 'H.', exits: { N: 'a2' } },
      { id: 'a2', title: 'Study', desc: 'S.' },
      { id: 'a3', title: 'Vault', desc: 'V.' },
    ]);
    const t = new AzahTracer(m);
    for (const to of ['Study', 'Study', 'Vault']) {
      await t.apply(seen('Hall', 'H.', ['N']), ctx(undefined, 's1'));
      await t.apply(seen(to, to === 'Study' ? 'S.' : 'V.', []), ctx('N', 's1'));
    }
    expect(t.report().links['l-a1-N']).toBe('agree');

    const u = new AzahTracer(m);
    await u.apply(seen('Hall', 'H.', ['N']), ctx());
    await u.apply(seen('Vault', 'V.', []), ctx('N'));
    expect(u.report().links['l-a1-N']).toBe('disagree');
  });

  it('a set of possible rooms bigger than the tracking limit is not followed step by step', async () => {
    const big = mk(Array.from({ length: 20_001 }, (_, i) => ({ id: `m${i}`, title: 'Maze', desc: LONG, exits: { N: `m${(i + 1) % 20_001}` } })));
    const t = new AzahTracer(big);
    await t.apply(seen('Maze', LONG, ['N']), ctx());
    await t.apply(seen('Maze', LONG, ['N']), ctx('N'));
    expect(t.report().counts.steps).toBe(0);
  });
});

describe('AzahTracer: dark rooms and where the disagreements are', () => {
  it('a view of a room the player cannot see loses the position and is not an unmatched room', async () => {
    const t = new AzahTracer(mk([{ id: 'a1', title: 'Hall', desc: 'H.', exits: { N: 'a2' } }, { id: 'a2', title: 'Study', desc: 'S.' }]));
    await t.apply(seen('Hall', 'H.', ['N']), ctx());
    await t.apply({ title: 'darkness', exits: [], text: 'dark' }, ctx('N'));
    await t.apply(seen('Study', 'S.', []), ctx('N'));
    const r = t.report();
    expect(r.counts).toMatchObject({ views: 3, dark: 1, unmatched: 0, steps: 0 });
    expect(r.unmatchedTitles).toEqual([]);
  });

  it('lists the rooms steps start in that disagree most, by class, most first', async () => {
    const m = mk([
      { id: 'a1', title: 'Hall', desc: 'H.', exits: { N: 'a2' } },
      { id: 'a2', title: 'Study', desc: 'S.' },
      { id: 'a3', title: 'Vault', desc: 'V.' },
      { id: 'b1', title: 'Gate', desc: 'G.' },
      { id: 'b2', title: 'Yard', desc: 'Y.' },
    ]);
    const t = new AzahTracer(m);
    for (let i = 0; i < 2; i += 1) {
      await t.apply(seen('Hall', 'H.', ['N']), ctx(undefined, `h${i}`));
      await t.apply(seen('Vault', 'V.', []), ctx('N', `h${i}`)); // target-differs
    }
    await t.apply(seen('Gate', 'G.', []), ctx(undefined, 'g'));
    await t.apply(seen('Yard', 'Y.', []), ctx('S', 'g')); // azah-lacks-exit
    expect(t.report().disagreementTitles).toEqual([
      { title: 'Hall', 'target-differs': 2, 'azah-lacks-exit': 0 },
      { title: 'Gate', 'target-differs': 0, 'azah-lacks-exit': 1 },
    ]);
  });

  it('ties in that list are alphabetical', async () => {
    const m = mk([
      { id: 'a1', title: 'Beta', desc: 'B.' },
      { id: 'a2', title: 'Alpha', desc: 'A.' },
      { id: 'a3', title: 'Other', desc: 'O.' },
    ]);
    const t = new AzahTracer(m);
    for (const from of ['Beta', 'Alpha']) {
      await t.apply(seen(from, from[0] + '.', []), ctx(undefined, from));
      await t.apply(seen('Other', 'O.', []), ctx('N', from));
    }
    expect(t.report().disagreementTitles.map((x) => x.title)).toEqual(['Alpha', 'Beta']);
  });
});

describe('AzahTracer: the evidence behind a link', () => {
  const m = mk([
    { id: 'a1', title: 'Hall', desc: 'H.', exits: { N: 'a2' } },
    { id: 'a2', title: 'Study', desc: 'S.' },
    { id: 'a3', title: 'Vault', desc: 'V.' },
  ]);

  it('counts the steps that agreed and the day of the latest', async () => {
    const t = new AzahTracer(m);
    for (const [session, day] of [['s1', '2026-07-03'], ['s2', '2026-07-05']] as const) {
      await t.apply(seen('Hall', 'H.', ['N']), ctx(undefined, session, day));
      await t.apply(seen('Study', 'S.', []), ctx('N', session, day));
    }
    expect(t.report().evidence).toEqual({ 'l-a1-N': { agree: 2, disagree: 0, lastDay: '2026-07-05', seenTo: [] } });
  });

  it('records the Azah rooms a disagreeing exit really led to, without repeats', async () => {
    const t = new AzahTracer(m);
    for (let i = 0; i < 2; i += 1) {
      await t.apply(seen('Hall', 'H.', ['N']), ctx(undefined, `s${i}`));
      await t.apply(seen('Vault', 'V.', []), ctx('N', `s${i}`));
    }
    expect(t.report().evidence['l-a1-N']).toEqual({ agree: 0, disagree: 2, lastDay: '2026-07-03', seenTo: ['a3'] });
  });

  it('keeps at most eight such rooms', async () => {
    const many = mk([
      { id: 'a1', title: 'Hall', desc: 'H.', exits: { N: 'a2' } },
      { id: 'a2', title: 'Study', desc: 'S.' },
      ...Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, title: 'Vault', desc: 'V.' })),
    ]);
    const t = new AzahTracer(many);
    await t.apply(seen('Hall', 'H.', ['N']), ctx());
    await t.apply(seen('Vault', 'V.', []), ctx('N'));
    expect(t.report().evidence['l-a1-N'].seenTo).toHaveLength(8);
  });
});

describe('AzahTracer: where the player is, and what the map says about an exit (live use)', () => {
  const m = (): MapFile => {
    const map = mk([
      { id: 'a1', title: 'Hall', desc: 'H.', exits: { N: 'a2', E: 'a3', S: 'a3' } },
      { id: 'a2', title: 'Study', desc: 'S.', exits: { S: 'a1' } },
      { id: 'a3', title: 'Vault', desc: 'V.' },
    ]);
    const link = (id: string) => map.links.find((l) => l.id === id)!;
    link('l-a1-N').confidence = 0.95;
    link('l-a1-N').state = 'confirmed';
    link('l-a1-E').confidence = 0;
    link('l-a1-E').state = 'conflict';
    link('l-a1-S').to = null;
    link('l-a1-S').state = 'unknown-target';
    return map;
  };

  it('is not placed before any view, and not after a view that fits no room', async () => {
    const t = new AzahTracer(m());
    expect(t.current()).toBeUndefined();
    expect(t.exitEvidence('N')).toBeNull();
    await t.apply(seen('Nowhere', 'x', ['N']), ctx());
    expect(t.current()).toBeUndefined();
  });

  it('knows the room once exactly one fits, and gives the confidence and state of each exit', async () => {
    const t = new AzahTracer(m());
    await t.apply(seen('Hall', 'H.', ['N', 'E', 'S']), ctx());
    expect(t.current()).toEqual({ id: 'a1', title: 'Hall' });
    expect(t.exitEvidence('N')).toEqual({ confidence: 0.95, state: 'confirmed' });
    expect(t.exitEvidence('E')).toEqual({ confidence: 0, state: 'conflict' });
    // an exit nobody knows the end of, and an exit the room does not have, say nothing
    expect(t.exitEvidence('S')).toBeNull();
    expect(t.exitEvidence('W')).toBeNull();
  });

  it('says nothing while several rooms fit, and forgets the room when the session ends', async () => {
    const twins = mk([
      { id: 't1', title: 'Desert', desc: LONG, exits: { E: 't2' } },
      { id: 't2', title: 'Desert', desc: LONG, exits: { E: 't1' } },
    ]);
    const t = new AzahTracer(twins);
    await t.apply(seen('Desert', LONG, ['E']), ctx());
    expect(t.current()).toBeUndefined();
    expect(t.exitEvidence('E')).toBeNull();
    const u = new AzahTracer(m());
    await u.apply(seen('Hall', 'H.', ['N', 'E', 'S']), ctx());
    u.endSession();
    expect(u.current()).toBeUndefined();
  });
});
