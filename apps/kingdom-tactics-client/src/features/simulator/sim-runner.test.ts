import { providers } from '../../state/providers';
import { runSimBatch, type SimConfig } from './sim-runner';

const greedyDuel = (matches: number, baseSeed = 1): SimConfig => ({
  modeId: 'skirmish',
  policyBySide: { 0: 'greedy', 1: 'greedy' },
  matches,
  baseSeed,
});

describe('runSimBatch', () => {
  it('runs N matches and reconciles wins + draws to the count', async () => {
    const summary = await runSimBatch(greedyDuel(6), providers);
    expect(summary.matches).toBe(6);
    expect(summary.results).toHaveLength(6);
    const wins = Object.values(summary.winsBySide).reduce((a, b) => a + b, 0);
    expect(wins + summary.draws).toBe(6);
    expect(summary.avgTurns).toBeGreaterThan(0);
    // Each match i is seeded baseSeed + i.
    expect(summary.results.map((r) => r.seed)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is deterministic — same config yields a deep-equal summary', async () => {
    const a = await runSimBatch(greedyDuel(5, 42), providers);
    const b = await runSimBatch(greedyDuel(5, 42), providers);
    expect(b).toEqual(a);
  });

  it('reports progress up to the match count', async () => {
    const seen: number[] = [];
    const summary = await runSimBatch(greedyDuel(20), providers, (done) => seen.push(done));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(summary.matches);
    // Progress is monotonic and never exceeds the count.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    expect(Math.max(...seen)).toBeLessThanOrEqual(20);
  });

  it('cancels early and returns the partial summary gathered so far', async () => {
    const summary = await runSimBatch(greedyDuel(64), providers, undefined, () => true);
    // Cancels after the first chunk (16), so fewer than the requested 64 ran.
    expect(summary.matches).toBeLessThan(64);
    expect(summary.matches).toBeGreaterThan(0);
    expect(summary.results).toHaveLength(summary.matches);
  });

  it('supports a Random policy and multi-side (ffa) modes', async () => {
    const summary = await runSimBatch(
      {
        modeId: 'ffa',
        policyBySide: { 0: 'random', 1: 'random', 2: 'random', 3: 'random' },
        matches: 3,
        baseSeed: 7,
      },
      providers,
    );
    expect(summary.matches).toBe(3);
    const wins = Object.values(summary.winsBySide).reduce((a, b) => a + b, 0);
    expect(wins + summary.draws).toBe(3);
  });
});
