import { effectiveConfidence, MIN_BUCKET_SAMPLES, toConfidence, wilsonLower } from './confidence';

describe('toConfidence', () => {
  it('accepts a finite number in [0, 1], including the ends', () => {
    expect(toConfidence(0)).toBe(0);
    expect(toConfidence(0.5)).toBe(0.5);
    expect(toConfidence(1)).toBe(1);
  });

  it.each([NaN, Infinity, -Infinity, -0.01, 1.01, 7, '0.9', null, undefined, {}, [], true])('%p -> null', (value) => {
    expect(toConfidence(value)).toBeNull();
  });
});

describe('wilsonLower', () => {
  it('is 0 with no data', () => {
    expect(wilsonLower(0, 0)).toBe(0);
  });

  it('matches the known Wilson (95%) values', () => {
    // reference values from the Wilson score interval formula
    expect(wilsonLower(20, 20)).toBeCloseTo(0.8389, 3);
    expect(wilsonLower(10, 20)).toBeCloseTo(0.2993, 3);
    expect(wilsonLower(100, 100)).toBeCloseTo(0.963, 3);
    expect(wilsonLower(1, 1)).toBeCloseTo(0.2065, 3);
    expect(wilsonLower(0, 20)).toBe(0);
  });

  it('grows with more evidence at the same rate, and shrinks as the rate falls', () => {
    expect(wilsonLower(40, 40)!).toBeGreaterThan(wilsonLower(20, 20)!);
    expect(wilsonLower(18, 20)!).toBeLessThan(wilsonLower(20, 20)!);
  });

  it.each([
    [-1, 5],
    [6, 5],
    [1.5, 5],
    [1, 5.5],
    [NaN, 5],
    [1, NaN],
    [1, -2],
  ])('impossible counts (%p of %p) -> null', (approved, total) => {
    expect(wilsonLower(approved, total)).toBeNull();
  });
});

describe('effectiveConfidence (P4)', () => {
  it('is the smaller of the rating and the earned approval rate', () => {
    expect(effectiveConfidence(0.95, { approved: 20, total: 20 }).value).toBeCloseTo(0.8389, 3); // earned rate is lower
    expect(effectiveConfidence(0.6, { approved: 20, total: 20 }).value).toBe(0.6); // rating is lower
  });

  it('needs MIN_BUCKET_SAMPLES decisions: 19 is not eligible and has no value, 20 is eligible', () => {
    expect(MIN_BUCKET_SAMPLES).toBe(20);
    expect(effectiveConfidence(0.99, { approved: 19, total: 19 })).toEqual({ value: null, eligible: false, samples: 19 });
    expect(effectiveConfidence(0.99, { approved: 20, total: 20 })).toMatchObject({ eligible: true, samples: 20 });
  });

  it('uses the edge evidence instead of the model rating when it is given (map movement)', () => {
    expect(effectiveConfidence(0.1, { approved: 20, total: 20 }, 0.95).value).toBeCloseTo(0.8389, 3);
    expect(effectiveConfidence(0.99, { approved: 20, total: 20 }, 0.5).value).toBe(0.5);
  });

  it('does not fall back to the model rating when the edge evidence is unusable', () => {
    expect(effectiveConfidence(0.99, { approved: 20, total: 20 }, NaN).value).toBeNull();
  });

  it.each([NaN, -0.5, 1.5, undefined, null, '0.9'])('an unusable rating (%p) gives no value even with plenty of history', (rating) => {
    expect(effectiveConfidence(rating, { approved: 50, total: 50 })).toMatchObject({ value: null, eligible: true });
  });

  it.each([undefined, null, {}, { approved: 5 }, { approved: 'x', total: 30 }, { approved: 31, total: 30 }, { approved: -1, total: 30 }, { approved: 1.5, total: 30 }])(
    'missing or broken bucket statistics (%p) give no value and are not eligible',
    (bucket) => {
      expect(effectiveConfidence(0.9, bucket)).toEqual({ value: null, eligible: false, samples: 0 });
    },
  );

  it('a bad approval history does not earn confidence', () => {
    expect(effectiveConfidence(0.95, { approved: 5, total: 25 }).value!).toBeLessThan(0.3);
  });
});
