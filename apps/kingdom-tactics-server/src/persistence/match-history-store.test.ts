import fs from 'fs';
import os from 'os';
import path from 'path';
import type { MatchState } from '@shatteredarchive/kingdom-tactics-engine';
import { MatchHistoryStore, type MatchHistoryEntry } from './match-history-store.js';

function tmpDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kt-match-history-test-'));
}

const fakeState = { activeSide: 0 } as unknown as MatchState;

function entry(overrides: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry {
  return {
    id: 'h1',
    matchId: 'm1',
    playedAt: '2026-07-28T00:00:00.000Z',
    participants: [{ side: 0, accountId: 'acc1' }],
    winner: 0,
    initial: fakeState,
    actionLog: [{ type: 'end-turn', side: 0 }],
    replaySeed: { seed: 1, combatSalt: 42 },
    ...overrides,
  };
}

describe('MatchHistoryStore', () => {
  it('records a match under a participant accountId and lists it back as a summary (no initial/actionLog/replaySeed)', () => {
    const store = new MatchHistoryStore(tmpDataDir());
    store.record(entry());

    const summaries = store.listSummaries('acc1');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      id: 'h1',
      matchId: 'm1',
      playedAt: '2026-07-28T00:00:00.000Z',
      participants: [{ side: 0, accountId: 'acc1' }],
      winner: 0,
    });
    expect(summaries[0]).not.toHaveProperty('initial');
    expect(summaries[0]).not.toHaveProperty('actionLog');
    expect(summaries[0]).not.toHaveProperty('replaySeed');
  });

  it('records under every participant with an accountId, never under a null (anonymous) seat', () => {
    const store = new MatchHistoryStore(tmpDataDir());
    store.record(
      entry({
        participants: [
          { side: 0, accountId: 'acc1' },
          { side: 1, accountId: null },
        ],
      }),
    );
    expect(store.listSummaries('acc1')).toHaveLength(1);
  });

  it('records once per DISTINCT accountId even if it appears on multiple seats', () => {
    const store = new MatchHistoryStore(tmpDataDir());
    store.record(
      entry({
        participants: [
          { side: 0, accountId: 'acc1' },
          { side: 1, accountId: 'acc1' },
        ],
      }),
    );
    expect(store.listSummaries('acc1')).toHaveLength(1);
  });

  it('is a no-op when no participant carries an accountId (fully anonymous match)', () => {
    const store = new MatchHistoryStore(tmpDataDir());
    store.record(entry({ participants: [{ side: 0, accountId: null }] }));
    expect(store.listSummaries('acc1')).toEqual([]);
  });

  it('evicts the oldest entry past the 25-per-account cap', () => {
    const store = new MatchHistoryStore(tmpDataDir());
    for (let i = 0; i < 30; i++) {
      store.record(entry({ id: `h${i}`, matchId: `m${i}` }));
    }
    const summaries = store.listSummaries('acc1');
    expect(summaries).toHaveLength(25);
    expect(summaries[0].id).toBe('h5'); // the first 5 (h0-h4) were evicted
    expect(summaries[summaries.length - 1].id).toBe('h29');
  });

  it('get() returns the full entry (incl. replaySeed) scoped to the requesting account', () => {
    const store = new MatchHistoryStore(tmpDataDir());
    store.record(entry());
    expect(store.get('acc1', 'h1')?.replaySeed).toEqual({ seed: 1, combatSalt: 42 });
    expect(store.get('acc1', 'nope')).toBeUndefined();
    expect(store.get('someone-else', 'h1')).toBeUndefined(); // not their match
  });
});
