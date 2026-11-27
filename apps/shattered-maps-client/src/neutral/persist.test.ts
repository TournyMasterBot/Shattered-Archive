import { emptyMap } from '@shatteredarchive/shattered-maps-core';
import { candidatesMap } from '../testing/neutralFixtures';
import { emptyLog, type ReviewLog } from './review';
import { AUDITED_KEY, REVIEW_KEY, loadAudited, parseLog, saveAudited } from './persist';

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
};

const log: ReviewLog = {
  version: 1,
  decisions: [
    { kind: 'room', id: 'r-gate', status: 'edited', at: '2026-11-07', note: 'iron', edits: ['title'] },
    { kind: 'link', id: 'l1', status: 'rejected', at: '2026-11-07', note: '' },
  ],
};

describe('saveAudited and loadAudited', () => {
  it('round-trips the audited file and the log', () => {
    const store = memory();
    expect(saveAudited(candidatesMap(), log, store)).toBe(true);
    expect([...store.data.keys()].sort()).toEqual([AUDITED_KEY, REVIEW_KEY].sort());
    const loaded = loadAudited(store);
    expect(loaded.audited).toEqual(candidatesMap());
    expect(loaded.log).toEqual(log);
  });

  it('starts empty when nothing is stored', () => {
    expect(loadAudited(memory())).toEqual({ audited: emptyMap(), log: emptyLog() });
  });

  it('starts empty, without throwing, when the stored text is not JSON or not a valid map', () => {
    expect(loadAudited(memory({ [AUDITED_KEY]: '{ nope' })).audited).toEqual(emptyMap());
    expect(loadAudited(memory({ [AUDITED_KEY]: JSON.stringify({ version: 1, continents: 'x', links: [] }) })).audited).toEqual(emptyMap());
    expect(loadAudited(memory({ [REVIEW_KEY]: 'also not json' })).log).toEqual(emptyLog());
  });

  it('keeps a good log when only the map is bad, and a good map when only the log is bad', () => {
    const goodMap = JSON.stringify(candidatesMap());
    expect(loadAudited(memory({ [AUDITED_KEY]: '[]', [REVIEW_KEY]: JSON.stringify(log) })).log).toEqual(log);
    expect(loadAudited(memory({ [AUDITED_KEY]: goodMap, [REVIEW_KEY]: '[]' })).audited).toEqual(candidatesMap());
  });

  it('says when the browser refused the write', () => {
    const full = { setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(saveAudited(emptyMap(), emptyLog(), full)).toBe(false);
  });

  it('uses the page storage by default', () => {
    localStorage.clear();
    expect(saveAudited(emptyMap('2026-11-07'), log)).toBe(true);
    expect(loadAudited().log).toEqual(log);
    localStorage.clear();
  });
});

describe('parseLog', () => {
  it('drops decisions that are not shaped like decisions, and keeps the rest in order', () => {
    const parsed = parseLog({
      version: 1,
      decisions: [
        null,
        'x',
        { kind: 'room', id: 'a', status: 'accepted', at: '2026-11-01', note: '' },
        { kind: 'wall', id: 'a', status: 'accepted', at: 'x', note: '' },
        { kind: 'room', id: 7, status: 'accepted', at: 'x', note: '' },
        { kind: 'room', id: 'b', status: 'maybe', at: 'x', note: '' },
        { kind: 'link', id: 'c', status: 'edited', at: '2026-11-02', note: 'n', edits: ['to', 3] },
        { kind: 'link', id: 'd', status: 'edited', at: '2026-11-03', note: 'n', edits: ['to'] },
        { kind: 'link', id: 'e', status: 'rejected', at: 'x' },
      ],
    });
    expect(parsed.decisions.map((d) => d.id)).toEqual(['a', 'c', 'd']);
    expect(parsed.decisions[1].edits).toBeUndefined();
    expect(parsed.decisions[2].edits).toEqual(['to']);
  });

  it('is an empty log for anything that is not a version-1 log', () => {
    for (const value of [null, 3, [], {}, { version: 2, decisions: [] }, { version: 1 }, { version: 1, decisions: 'x' }]) {
      expect(parseLog(value)).toEqual(emptyLog());
    }
  });
});
