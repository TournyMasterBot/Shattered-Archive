import {
  contentKey,
  DEFAULT_BASELINE_CONFIG,
  fixturesOf,
  mergeBaselines,
  normalizeBaselineConfig,
  updateBaseline,
  type Visit,
} from './baseline.js';
import { emptyBaseline, LIMITS, type RoomBaseline } from './schema.js';

const rat = { label: 'a grey rat', kind: 'mob' as const };
const lamp = { label: 'a brass lamp', kind: 'item' as const };

function visit(day: string, ...entries: Visit['entries']): Visit {
  return { day, entries };
}

function run(visits: Visit[], start?: RoomBaseline): RoomBaseline {
  return visits.reduce<RoomBaseline | undefined>((b, v) => updateBaseline(b, v), start) as RoomBaseline;
}

const days = ['2026-11-01', '2026-11-01', '2026-11-02', '2026-11-02', '2026-11-03'];

describe('updateBaseline — the P5 fixture rule', () => {
  it('keeps a one-off sighting transient', () => {
    const b = updateBaseline(undefined, visit('2026-11-01', rat));
    expect(b.visits).toBe(1);
    expect(b.contents).toHaveLength(1);
    expect(b.contents[0]).toMatchObject({
      label: 'a grey rat',
      status: 'transient',
      seen: 1,
      observed: 1,
      count: 1,
      firstSeen: '2026-11-01',
      missed: 0,
    });
    expect(fixturesOf(b)).toEqual([]);
  });

  it('makes a fixture of a thing seen on five visits across three days (ratio 1)', () => {
    const b = run(days.map((d) => visit(d, rat)));
    expect(fixturesOf(b).map((c) => c.label)).toEqual(['a grey rat']);
    expect(b.contents[0]).toMatchObject({ status: 'fixture', seen: 5, observed: 5, returns: 0 });
    expect(b.days).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('promotes at exactly 0.8: five sightings in six visits across three days', () => {
    const b = run([
      visit('2026-11-01', rat),
      visit('2026-11-01', rat),
      visit('2026-11-02', rat),
      visit('2026-11-02', lamp), // the rat is missing once
      visit('2026-11-03', rat),
      visit('2026-11-03', rat),
    ]);
    const record = b.contents.find((c) => c.label === 'a grey rat');
    expect(record).toMatchObject({ seen: 5, observed: 6, status: 'fixture' });
  });

  it('does not promote below the ratio (five sightings in seven visits is 0.71)', () => {
    const b = run([
      ...days.map((d) => visit(d, rat)).slice(0, 2),
      visit('2026-11-02'),
      visit('2026-11-02', rat),
      visit('2026-11-03', rat),
      visit('2026-11-03'),
      visit('2026-11-03', rat),
    ]);
    const record = b.contents.find((c) => c.label === 'a grey rat');
    expect(record?.seen).toBe(5);
    expect(record?.observed).toBe(7);
    expect(record?.status).toBe('transient');
  });

  it('does not promote five sightings on one play day (needs three distinct days)', () => {
    const b = run(Array.from({ length: 5 }, () => visit('2026-11-01', rat)));
    expect(b.contents[0].seen).toBe(5);
    expect(b.contents[0].status).toBe('transient');
  });

  it('does not promote four sightings over three days (needs five visits)', () => {
    const b = run(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-03'].map((d) => visit(d, rat)));
    expect(b.contents[0].status).toBe('transient');
  });

  it('demotes a fixture after three visits without it and keeps it as `was`', () => {
    const fixed = run(days.map((d) => visit(d, rat)));
    const after2 = run([visit('2026-11-04'), visit('2026-11-04')], fixed);
    expect(after2.contents[0]).toMatchObject({ status: 'fixture', missed: 2 });
    expect(after2.was).toEqual([]);
    const after3 = run([visit('2026-11-05')], after2);
    expect(after3.contents).toEqual([]);
    expect(after3.was).toEqual([
      {
        label: 'a grey rat',
        kind: 'mob',
        seen: 5,
        observed: 8,
        count: 1,
        firstSeen: '2026-11-01',
        lastSeen: '2026-11-03',
        demotedOn: '2026-11-05',
        returns: 0,
      },
    ]);
  });

  it('a sighting between misses resets the miss run', () => {
    const fixed = run(days.map((d) => visit(d, rat)));
    const b = run(
      [visit('2026-11-04'), visit('2026-11-04'), visit('2026-11-05', rat), visit('2026-11-05'), visit('2026-11-05')],
      fixed,
    );
    expect(b.contents[0]).toMatchObject({ status: 'fixture', missed: 2 });
    expect(b.was).toEqual([]);
  });

  it('a demoted fixture that is seen consistently again is a fixture again, off `was`, with returns counted', () => {
    const demoted = run([
      ...days.map((d) => visit(d, rat)),
      visit('2026-11-04'),
      visit('2026-11-04'),
      visit('2026-11-05'),
    ]);
    expect(demoted.was).toHaveLength(1);
    const back = run(
      ['2026-11-06', '2026-11-06', '2026-11-07', '2026-11-07', '2026-11-08'].map((d) => visit(d, rat)),
      demoted,
    );
    expect(back.was).toEqual([]);
    expect(back.contents[0]).toMatchObject({ label: 'a grey rat', status: 'fixture', returns: 1 });
  });

  it('while it is back but not yet a fixture, `was` is kept and the new record carries the return count', () => {
    const demoted = run([
      ...days.map((d) => visit(d, rat)),
      visit('2026-11-04'),
      visit('2026-11-04'),
      visit('2026-11-05'),
    ]);
    const seenOnce = run([visit('2026-11-06', rat)], demoted);
    expect(seenOnce.was).toHaveLength(1);
    expect(seenOnce.contents[0]).toMatchObject({ status: 'transient', returns: 0 });
  });

  it('promotes on the first sighting when the config asks for one sighting on one day, and counts a return from `was`', () => {
    const config = normalizeBaselineConfig({ minVisits: 1, minDays: 1, minRatio: 1, demoteAfterMisses: 1 });
    let b = updateBaseline(undefined, visit('2026-11-01', rat), config);
    expect(b.contents[0]).toMatchObject({ status: 'fixture', returns: 0 });
    b = updateBaseline(b, visit('2026-11-02'), config);
    expect(b.was).toHaveLength(1);
    b = updateBaseline(b, visit('2026-11-03', rat), config);
    expect(b.was).toEqual([]);
    expect(b.contents[0]).toMatchObject({ status: 'fixture', returns: 1 });
  });

  it('lets a transient expire after three visits without it', () => {
    const b = run([visit('2026-11-01', rat), visit('2026-11-01'), visit('2026-11-02'), visit('2026-11-03')]);
    expect(b.contents).toEqual([]);
    expect(b.was).toEqual([]);
    expect(b.visits).toBe(4);
  });

  it('never lets a player-like one-off entry into the baseline', () => {
    const b = updateBaseline(
      undefined,
      visit('2026-11-01', { label: 'Someone the Wanderer is here', kind: 'player' }, rat),
    );
    expect(b.contents.map((c) => c.label)).toEqual(['a grey rat']);
    const only = updateBaseline(
      undefined,
      visit('2026-11-01', { label: 'Someone the Wanderer is here', kind: 'player' }),
    );
    expect(only.contents).toEqual([]);
    expect(only.visits).toBe(1);
  });

  it('sums repeated entries of one visit and ignores case and spacing in the key', () => {
    const b = updateBaseline(
      undefined,
      visit('2026-11-01', { ...rat, count: 2 }, { label: '  A  GREY rat ', kind: 'mob' }),
    );
    expect(b.contents).toHaveLength(1);
    expect(b.contents[0].count).toBe(3);
    expect(contentKey('  A  GREY rat ')).toBe('a grey rat');
  });

  it('bounds a count, and reads a bad count as one', () => {
    const b = updateBaseline(undefined, visit('2026-11-01', { ...rat, count: 5000 }, { ...lamp, count: -2 }));
    expect(b.contents.find((c) => c.label === 'a grey rat')?.count).toBe(1000);
    expect(b.contents.find((c) => c.label === 'a brass lamp')?.count).toBe(1);
  });

  it('skips empty labels and cuts a long label', () => {
    const b = updateBaseline(
      undefined,
      visit('2026-11-01', { label: '   ', kind: 'item' }, { label: 'x'.repeat(500), kind: 'item' }),
    );
    expect(b.contents).toHaveLength(1);
    expect(b.contents[0].label).toHaveLength(LIMITS.shortText);
  });

  it('ignores a visit whose day is malformed and returns a copy of what it had', () => {
    const before = run([visit('2026-11-01', rat)]);
    for (const bad of ['yesterday', '2026-11-01T10:00:00Z', '']) {
      const after = updateBaseline(before, { day: bad, entries: [lamp] });
      expect(after).toEqual(before);
      expect(after).not.toBe(before);
    }
    expect(updateBaseline(before, { day: '2026-11-02', entries: 'nope' as never })).toEqual(before);
  });

  it('never changes the baseline it was given', () => {
    const before = run([visit('2026-11-01', rat)]);
    const snapshot = JSON.parse(JSON.stringify(before));
    updateBaseline(before, visit('2026-11-02', lamp));
    expect(before).toEqual(snapshot);
  });

  it('takes a different config: two visits on two days are enough at minVisits 2, minDays 2', () => {
    const config = normalizeBaselineConfig({ minVisits: 2, minDays: 2, minRatio: 1, demoteAfterMisses: 1 });
    let b = updateBaseline(undefined, visit('2026-11-01', rat), config);
    b = updateBaseline(b, visit('2026-11-02', rat), config);
    expect(b.contents[0].status).toBe('fixture');
    b = updateBaseline(b, visit('2026-11-03'), config);
    expect(b.contents).toEqual([]);
    expect(b.was).toHaveLength(1);
  });

  it('records out-of-order days without breaking first and last seen', () => {
    const b = run([visit('2026-11-03', rat), visit('2026-11-01', rat)]);
    expect(b.contents[0]).toMatchObject({ firstSeen: '2026-11-01', lastSeen: '2026-11-03' });
    expect(b.days).toEqual(['2026-11-01', '2026-11-03']);
  });

  it('keeps the newest play days when there are more than the cap', () => {
    const many = Array.from({ length: LIMITS.maxDays + 5 }, (_, i) =>
      visit(`2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, rat),
    );
    const b = run(many);
    expect(b.days).toHaveLength(LIMITS.maxDays);
    expect(b.days[b.days.length - 1]).toBe(many[many.length - 1].day);
    expect(b.contents[0].days).toHaveLength(LIMITS.maxDays);
  });

  it('keeps at most the cap of contents, dropping the transients with the least evidence first', () => {
    const entries = Array.from({ length: LIMITS.maxContents + 10 }, (_, i) => ({
      label: `thing ${i}`,
      kind: 'item' as const,
    }));
    const b = updateBaseline(undefined, visit('2026-11-01', ...entries));
    expect(b.contents).toHaveLength(LIMITS.maxContents);
    // a fixture outranks a transient when the list is over the cap
    const fixed = run(days.map((d) => visit(d, rat, ...entries.slice(0, 5))));
    const crowded = updateBaseline(fixed, visit('2026-11-04', rat, ...entries));
    expect(crowded.contents.length).toBeLessThanOrEqual(LIMITS.maxContents);
    expect(crowded.contents.find((c) => c.label === 'a grey rat')?.status).toBe('fixture');
  });

  it('keeps at most the cap of `was`, the newest demotions', () => {
    let b: RoomBaseline = emptyBaseline();
    const config = normalizeBaselineConfig({ minVisits: 1, minDays: 1, minRatio: 1, demoteAfterMisses: 1 });
    for (let i = 0; i < LIMITS.maxWas + 3; i += 1) {
      const day = `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`;
      b = updateBaseline(b, { day, entries: [{ label: `ghost ${i}`, kind: 'mob' }] }, config);
      b = updateBaseline(b, { day, entries: [] }, config);
    }
    expect(b.was).toHaveLength(LIMITS.maxWas);
  });
});

describe('normalizeBaselineConfig', () => {
  it('uses the defaults for nothing and for unusable values', () => {
    expect(normalizeBaselineConfig()).toEqual(DEFAULT_BASELINE_CONFIG);
    expect(normalizeBaselineConfig(null)).toEqual(DEFAULT_BASELINE_CONFIG);
    expect(normalizeBaselineConfig({ minVisits: 0, minDays: 2.5, minRatio: 1.5, demoteAfterMisses: '3' })).toEqual(
      DEFAULT_BASELINE_CONFIG,
    );
    expect(normalizeBaselineConfig({ minRatio: 0 }).minRatio).toBe(DEFAULT_BASELINE_CONFIG.minRatio);
    expect(normalizeBaselineConfig({ minRatio: Number.NaN }).minRatio).toBe(DEFAULT_BASELINE_CONFIG.minRatio);
  });

  it('keeps usable values', () => {
    expect(normalizeBaselineConfig({ minVisits: 8, minDays: 4, minRatio: 0.9, demoteAfterMisses: 6 })).toEqual({
      minVisits: 8,
      minDays: 4,
      minRatio: 0.9,
      demoteAfterMisses: 6,
    });
  });

  it('has the P5 defaults: 5 visits, 3 days, 0.8, 3 misses', () => {
    expect(DEFAULT_BASELINE_CONFIG).toEqual({ minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 });
  });
});

describe('mergeBaselines', () => {
  it('adds visits and sightings, widens dates, and keeps a fixture a fixture', () => {
    const a = run(days.map((d) => visit(d, rat)));
    const b = run([visit('2026-10-20', rat, lamp), visit('2026-12-01', lamp)]);
    const merged = mergeBaselines(a, b);
    expect(merged.visits).toBe(7);
    expect(merged.days).toEqual(['2026-10-20', '2026-11-01', '2026-11-02', '2026-11-03', '2026-12-01']);
    const mergedRat = merged.contents.find((c) => c.label === 'a grey rat');
    // the second room saw the rat on its first visit and not on its second (observed 2), so 5 + 2 visits since first seen
    expect(mergedRat).toMatchObject({
      status: 'fixture',
      seen: 6,
      observed: 7,
      firstSeen: '2026-10-20',
      lastSeen: '2026-11-03',
    });
    expect(merged.contents.find((c) => c.label === 'a brass lamp')).toMatchObject({ status: 'transient', seen: 2 });
  });

  it('takes one side when the other is missing, and never changes its inputs', () => {
    const a = run([visit('2026-11-01', rat)]);
    const snapshot = JSON.parse(JSON.stringify(a));
    expect(mergeBaselines(a, undefined)).toEqual(a);
    expect(mergeBaselines(undefined, a)).toEqual(a);
    expect(mergeBaselines(undefined, undefined)).toEqual(emptyBaseline());
    mergeBaselines(a, a);
    expect(a).toEqual(snapshot);
  });

  it('keeps the later demotion of the same thing, and drops a `was` that is a fixture again', () => {
    const wasA = run([
      ...days.map((d) => visit(d, rat)),
      visit('2026-11-04'),
      visit('2026-11-04'),
      visit('2026-11-05'),
    ]);
    const wasB = run([
      ...days.map((d) => visit(d, rat)),
      visit('2026-11-06'),
      visit('2026-11-06'),
      visit('2026-11-07'),
    ]);
    const merged = mergeBaselines(wasA, wasB);
    expect(merged.was).toHaveLength(1);
    expect(merged.was[0].demotedOn).toBe('2026-11-07');
    expect(mergeBaselines(wasB, wasA).was[0].demotedOn).toBe('2026-11-07');
    const live = run(days.map((d) => visit(d, rat)));
    expect(mergeBaselines(wasA, live).was).toEqual([]);
  });

  it('keeps the smallest miss run, the largest count and the largest return count', () => {
    const left = run([visit('2026-11-01', { ...rat, count: 2 }), visit('2026-11-02')]);
    const right = run([visit('2026-11-01', { ...rat, count: 4 })]);
    right.contents[0].returns = 3;
    const merged = mergeBaselines(left, right);
    expect(merged.contents[0]).toMatchObject({ count: 4, missed: 0, returns: 3 });
  });

  it('widens the dates the same way whichever side is first, and keeps the newest play days past the cap', () => {
    const early = run([visit('2026-11-01', rat), visit('2026-11-02', rat)]);
    const late = run([visit('2026-11-08', rat)]);
    for (const [x, y] of [
      [early, late],
      [late, early],
    ]) {
      expect(mergeBaselines(x, y).contents[0]).toMatchObject({ firstSeen: '2026-11-01', lastSeen: '2026-11-08' });
    }
    // a fixture on the right side makes the merged thing a fixture too
    const fixed = run(days.map((d) => visit(d, rat)));
    expect(mergeBaselines(late, fixed).contents[0].status).toBe('fixture');
    const dayList = (from: number): RoomBaseline => ({
      ...emptyBaseline(),
      days: Array.from(
        { length: LIMITS.maxDays },
        (_, i) =>
          `2026-${String(1 + Math.floor((from + i) / 28)).padStart(2, '0')}-${String(1 + ((from + i) % 28)).padStart(2, '0')}`,
      ),
    });
    const merged = mergeBaselines(dayList(0), dayList(20));
    expect(merged.days).toHaveLength(LIMITS.maxDays);
    expect(merged.days.at(-1)).toBe(dayList(20).days.at(-1));
  });

  it('respects the caps', () => {
    const many = (prefix: string): RoomBaseline =>
      updateBaseline(
        undefined,
        visit(
          '2026-11-01',
          ...Array.from({ length: LIMITS.maxContents }, (_, i) => ({ label: `${prefix} ${i}`, kind: 'item' as const })),
        ),
      );
    expect(mergeBaselines(many('a'), many('b')).contents).toHaveLength(LIMITS.maxContents);
    const wasMany = (prefix: string): RoomBaseline => ({
      ...emptyBaseline(),
      was: Array.from({ length: LIMITS.maxWas }, (_, i) => ({
        label: `${prefix} ${i}`,
        kind: 'mob' as const,
        seen: 5,
        observed: 5,
        count: 1,
        firstSeen: '2026-11-01',
        lastSeen: '2026-11-02',
        demotedOn: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`,
        returns: 0,
      })),
    });
    expect(mergeBaselines(wasMany('a'), wasMany('b')).was).toHaveLength(LIMITS.maxWas);
  });
});

describe('fixturesOf', () => {
  it('is empty for no baseline', () => {
    expect(fixturesOf(undefined)).toEqual([]);
  });
});
