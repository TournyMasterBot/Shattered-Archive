import { DEFAULT_MAX_ENTRIES, DEFAULT_TTL_MS, keywordOf, MonsterKnowledge, sameTarget } from './knowledge.js';

const BAND = { kind: 'band', band: 'even', minDiff: -1, maxDiff: 1, name: '' } as const;

describe('keywordOf', () => {
  it('is the first word, lower case, without a count in front', () => {
    expect(keywordOf('Goblin')).toBe('goblin');
    expect(keywordOf('  2.Orc chief ')).toBe('orc');
    expect(keywordOf('10.wolf')).toBe('wolf');
    expect(keywordOf('')).toBe('');
    expect(keywordOf('   ')).toBe('');
  });
});

describe('sameTarget', () => {
  it('matches a keyword that is a prefix of the other, either way round, and never an empty one', () => {
    expect(sameTarget('orc', 'orc')).toBe(true);
    expect(sameTarget('or', 'orc')).toBe(true);
    expect(sameTarget('orcish', 'orc')).toBe(true);
    expect(sameTarget('orc', 'goblin')).toBe(false);
    expect(sameTarget('', 'orc')).toBe(false);
    expect(sameTarget('orc', '')).toBe(false);
  });
});

describe('MonsterKnowledge', () => {
  it('keeps what a lookup and a consider found, per room and per target', () => {
    const k = new MonsterKnowledge();
    k.recordLookup('Cave', 'goblin', { found: true, facts: ['level 5'] }, 1000);
    k.recordConsider('Cave', 'gob', BAND, 2000);
    expect(k.get('Cave', 'goblin', 3000)).toEqual({ lookup: { found: true, facts: ['level 5'], at: 1000 }, considered: { result: BAND, at: 2000 } });
    expect(k.get('Cave', 'gob', 3000)?.lookup?.found).toBe(true); // the same target by prefix
    expect(k.size()).toBe(1);
  });

  it('knows nothing about another room, another monster, or a blank keyword', () => {
    const k = new MonsterKnowledge();
    k.recordLookup('Cave', 'goblin', { found: false, facts: [] }, 1000);
    expect(k.get('Hall', 'goblin', 1000)).toBeUndefined();
    expect(k.get('Cave', 'orc', 1000)).toBeUndefined();
    expect(k.get('Cave', '', 1000)).toBeUndefined();
    k.recordLookup('Cave', '', { found: true, facts: [] }, 1000);
    k.recordConsider('Cave', '', BAND, 1000);
    expect(k.size()).toBe(1);
  });

  it('says only what is on record: a lookup alone or a consider alone', () => {
    const k = new MonsterKnowledge();
    k.recordConsider('Cave', 'orc', BAND, 1);
    expect(k.get('Cave', 'orc', 2)).toEqual({ considered: { result: BAND, at: 1 } });
    k.recordLookup('Cave', 'rat', { found: false, facts: [] }, 1);
    expect(k.get('Cave', 'rat', 2)).toEqual({ lookup: { found: false, facts: [], at: 1 } });
  });

  it('forgets an entry that has not been touched for the time to live, and refreshes it when it is recorded again', () => {
    const k = new MonsterKnowledge({ ttlMs: 1000 });
    k.recordConsider('Cave', 'orc', BAND, 0);
    expect(k.get('Cave', 'orc', 1000)).toBeDefined();
    expect(k.get('Cave', 'orc', 1001)).toBeUndefined();
    k.recordConsider('Cave', 'orc', BAND, 900); // touched again
    expect(k.get('Cave', 'orc', 1800)).toBeDefined();
    k.recordLookup('Cave', 'rat', { found: true, facts: [] }, 5000); // an old entry is dropped on the next record
    expect(k.size()).toBe(1);
    expect(DEFAULT_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('is bounded: past the limit the oldest entry goes', () => {
    const k = new MonsterKnowledge({ max: 3 });
    for (const name of ['aa', 'bb', 'cc', 'dd']) k.recordConsider('Cave', name, BAND, 1);
    expect(k.size()).toBe(3);
    expect(k.get('Cave', 'aa', 1)).toBeUndefined();
    expect(k.get('Cave', 'dd', 1)).toBeDefined();
    expect(DEFAULT_MAX_ENTRIES).toBe(200);
  });
});
