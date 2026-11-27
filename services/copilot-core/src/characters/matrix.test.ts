import { loadMatrix, normalizeName } from './matrix';

/** Invented rows shaped like the private matrix (codename, race, class, kind, male, female). */
const ROWS = [
  { codename: 'Agate', race: 'Elf', class: 'Warrior', kind: 'Base', male: 'Zorvak', female: 'Quenta' },
  { codename: 'C002', race: 'Dwarf', class: 'Mage', kind: 'Reclass', male: 'Tamsin', female: null },
];

describe('normalizeName', () => {
  it('trims and lower-cases', () => {
    expect(normalizeName('  ZorVak ')).toBe('zorvak');
  });
});

describe('loadMatrix', () => {
  it('indexes male and female names to the row codename and the matching gender, ignoring case', () => {
    const { matrix, rejected } = loadMatrix(ROWS);
    expect(rejected).toEqual([]);
    expect(matrix.rows).toBe(2);
    expect(matrix.lookup('Zorvak')).toEqual({ codename: 'Agate', gender: 'M' });
    expect(matrix.lookup('QUENTA')).toEqual({ codename: 'Agate', gender: 'F' });
    expect(matrix.lookup(' tamsin ')).toEqual({ codename: 'C002', gender: 'M' });
    expect(matrix.lookup('Nobody')).toBeUndefined();
  });

  it('lists every accepted name, normalised, with its codename and gender (for scrubbing)', () => {
    const { matrix } = loadMatrix(ROWS);
    expect(matrix.entries()).toEqual([
      { name: 'zorvak', codename: 'Agate', gender: 'M' },
      { name: 'quenta', codename: 'Agate', gender: 'F' },
      { name: 'tamsin', codename: 'C002', gender: 'M' },
    ]);
    expect(loadMatrix([]).matrix.entries()).toEqual([]);
  });

  it('accepts a row with a missing, null or empty name column (no character of that gender yet)', () => {
    const { matrix, rejected } = loadMatrix([
      { codename: 'C003', male: 'Orlen' },
      { codename: 'C004', male: '', female: undefined },
    ]);
    expect(rejected).toEqual([]);
    expect(matrix.rows).toBe(2);
    expect(matrix.lookup('Orlen')).toEqual({ codename: 'C003', gender: 'M' });
  });

  it('throws only when the input is not an array', () => {
    expect(() => loadMatrix({ rows: [] })).toThrow(TypeError);
    expect(() => loadMatrix(null)).toThrow(TypeError);
    expect(loadMatrix([]).matrix.rows).toBe(0);
  });

  it('rejects a row that is not an object', () => {
    const { rejected } = loadMatrix([5, null, 'x', [1]]);
    expect(rejected.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    expect(rejected.every((r) => r.reason === 'row is not an object')).toBe(true);
  });

  it('rejects a row with a missing or malformed codename, and keeps the other rows', () => {
    const { matrix, rejected } = loadMatrix([
      { male: 'Zorvak' },
      { codename: 'has space', male: 'Orlen' },
      { codename: 7, male: 'Jessa' },
      ROWS[0],
    ]);
    expect(rejected.map((r) => [r.index, r.reason])).toEqual([
      [0, 'codename missing or malformed'],
      [1, 'codename missing or malformed'],
      [2, 'codename missing or malformed'],
    ]);
    expect(matrix.rows).toBe(1);
    expect(matrix.lookup('Orlen')).toBeUndefined();
  });

  it('rejects a row whose name is not a plausible character name', () => {
    const { rejected } = loadMatrix([
      { codename: 'C010', male: 'two words' },
      { codename: 'C011', male: 'ok', female: 'x' },
      { codename: 'C012', male: 12 },
      { codename: 'C013', male: 'Bad<script>' },
    ]);
    expect(rejected.map((r) => r.reason)).toEqual(Array(4).fill('male or female name malformed'));
  });

  it('rejects the later row when a codename or a name is used twice (a name maps to exactly one codename)', () => {
    const { matrix, rejected } = loadMatrix([
      ROWS[0],
      { codename: 'agate', male: 'Orlen' }, // codename twice, case-insensitive
      { codename: 'C020', male: 'ZORVAK' }, // name twice, case-insensitive
      { codename: 'C021', male: 'Same', female: 'same' }, // both columns equal
    ]);
    expect(rejected.map((r) => [r.index, r.reason])).toEqual([
      [1, 'codename used twice'],
      [2, 'name used twice'],
      [3, 'name used twice'],
    ]);
    expect(matrix.lookup('Zorvak')).toEqual({ codename: 'Agate', gender: 'M' });
    expect(matrix.lookup('Orlen')).toBeUndefined();
  });

  it('never puts a name in a rejection reason', () => {
    const { rejected } = loadMatrix([ROWS[0], { codename: 'C020', male: 'Zorvak' }]);
    expect(JSON.stringify(rejected).toLowerCase()).not.toContain('zorvak');
  });
});
