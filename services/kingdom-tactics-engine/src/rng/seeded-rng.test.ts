import { createRng, Mulberry32, type ISeededRng } from './seeded-rng.js';

function take(rng: ISeededRng, n: number): number[] {
  return Array.from({ length: n }, () => rng.next());
}

describe('Mulberry32 seeded RNG', () => {
  it('produces an identical sequence for the same seed', () => {
    expect(take(createRng(12345), 12)).toEqual(take(createRng(12345), 12));
  });

  it('diverges for different seeds', () => {
    expect(take(createRng(1), 12)).not.toEqual(take(createRng(2), 12));
  });

  it('next() stays within [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) stays within [0, n)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
    expect(rng.int(0)).toBe(0);
  });

  it('pick() returns an element and throws on empty', () => {
    const rng = createRng(9);
    const arr = ['a', 'b', 'c'] as const;
    expect(arr).toContain(rng.pick(arr));
    expect(() => rng.pick([])).toThrow();
  });

  it('state() round-trips: createRng(state) resumes the same stream', () => {
    const a = createRng(999);
    a.next();
    a.next();
    const resumed = createRng(a.state());
    // Both are positioned at the same state, so their next draws match.
    expect(resumed.next()).toBe(a.next());
    expect(resumed.next()).toBe(a.next());
  });

  it('clone() is independent but starts at the same state', () => {
    const a = new Mulberry32(2024);
    a.next();
    const b = a.clone();
    expect(b.next()).toBe(a.next());
    // Advancing one does not affect the other's already-taken value.
    b.next();
    expect(a.state()).not.toBe(b.state());
  });
});
