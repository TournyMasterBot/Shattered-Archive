import { MAX_DURATION_TICKS, MAX_LAG_MS, normalizeAbility, normalizeClass } from './autoleveling-content-types';

// The two timing facts the server sends with every ability (live findings 2026-11-14, item 7; L37): the duration in ticks and the measured lag.
// Both are left out of the JSON when unknown, and 0 is a real value, so the client must never turn a missing field into 0.

const base = { name: 'Frenzy', type: 'spell', level: 20, groups: ['Protective'] };

describe('normalizeAbility keeps the timing facts', () => {
  it('carries both when the server sent them', () => {
    expect(normalizeAbility({ ...base, durationTicks: 18, lagMs: 3800 })).toEqual({ ...base, durationTicks: 18, lagMs: 3800 });
  });

  it('keeps a real 0 (under a tick, no lag worth measuring)', () => {
    const a = normalizeAbility({ ...base, durationTicks: 0, lagMs: 0 })!;
    expect(a.durationTicks).toBe(0);
    expect(a.lagMs).toBe(0);
  });

  it('leaves a missing field missing: an older server (or an unknown ability) gives no keys at all', () => {
    const a = normalizeAbility(base)!;
    expect(a).toEqual(base);
    expect(a).not.toHaveProperty('durationTicks');
    expect(a).not.toHaveProperty('lagMs');
  });

  it('takes each one on its own', () => {
    expect(normalizeAbility({ ...base, lagMs: 1900 })).toEqual({ ...base, lagMs: 1900 });
    expect(normalizeAbility({ ...base, durationTicks: 12 })).toEqual({ ...base, durationTicks: 12 });
  });

  it.each([['3800'], [-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY], [null], [{}], [[1]], [true]])('treats %p as unknown', (bad) => {
    const a = normalizeAbility({ ...base, durationTicks: bad, lagMs: bad })!;
    expect(a).not.toHaveProperty('durationTicks');
    expect(a).not.toHaveProperty('lagMs');
  });

  it('accepts the largest sane values and refuses anything above them', () => {
    expect(normalizeAbility({ ...base, durationTicks: MAX_DURATION_TICKS, lagMs: MAX_LAG_MS })).toMatchObject({ durationTicks: MAX_DURATION_TICKS, lagMs: MAX_LAG_MS });
    const over = normalizeAbility({ ...base, durationTicks: MAX_DURATION_TICKS + 1, lagMs: MAX_LAG_MS + 1 })!;
    expect(over).not.toHaveProperty('durationTicks');
    expect(over).not.toHaveProperty('lagMs');
  });

  it('is still null for a row with no name', () => {
    expect(normalizeAbility({ durationTicks: 3 })).toBeNull();
    expect(normalizeAbility(null)).toBeNull();
  });
});

describe('the class catalog keeps them on every ability', () => {
  it('a class carries each ability with its own timing, and a mix of known and unknown is fine', () => {
    const c = normalizeClass({
      name: 'Warrior',
      mortalClass: 1,
      isReclass: false,
      classGroup: '',
      abilities: [{ ...base, durationTicks: 18, lagMs: 3800 }, { name: 'Kick', type: 'skill', level: 1, groups: [] }],
    })!;
    expect(c.abilities.map((a) => [a.name, a.durationTicks, a.lagMs])).toEqual([
      ['Frenzy', 18, 3800],
      ['Kick', undefined, undefined],
    ]);
  });
});
