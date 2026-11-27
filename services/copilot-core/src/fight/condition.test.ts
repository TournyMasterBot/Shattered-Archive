import { CONDITION_ROWS, midPct, parseConditionLine } from './condition.js';

describe('parseConditionLine', () => {
  const cases: [string, number, number][] = [
    ['The goblin is in excellent condition.', 100, 100],
    ['The goblin has a few scratches.', 90, 99],
    ['The goblin has some small wounds and bruises.', 75, 89],
    ['The goblin has quite a few wounds.', 50, 74],
    ['The goblin has some big nasty wounds and scratches.', 30, 49],
    ['The goblin looks pretty hurt.', 15, 29],
    ['The goblin is in awful condition.', 0, 14],
    ['The goblin is bleeding to death.', -100, -1],
  ];

  it.each(cases)('reads "%s" as %i to %i percent', (line, min, max) => {
    expect(parseConditionLine(line)).toEqual({ name: 'The goblin', minPct: min, maxPct: max });
  });

  it('covers every row of the table, in order, with no gap between the ranges', () => {
    expect(CONDITION_ROWS.map((r) => [r.min, r.max])).toEqual(cases.map((c) => [c[1], c[2]]));
    for (let i = 1; i < CONDITION_ROWS.length; i += 1) expect(CONDITION_ROWS[i].max + 1).toBe(CONDITION_ROWS[i - 1].min);
  });

  it('keeps a long creature name whole and trims the line', () => {
    expect(parseConditionLine('  A big old cave troll with a club looks pretty hurt.  ')?.name).toBe('A big old cave troll with a club');
  });

  it('is not fooled by a line that only mentions a condition, or has no name', () => {
    expect(parseConditionLine('You feel in excellent condition.')).toBeUndefined(); // no "is": not the game's sentence
    expect(parseConditionLine(' is in excellent condition.')).toBeUndefined();
    expect(parseConditionLine('is in excellent condition.')).toBeUndefined();
    expect(parseConditionLine('The goblin is fine.')).toBeUndefined();
    expect(parseConditionLine('')).toBeUndefined();
  });
});

describe('midPct', () => {
  it('is the middle of the range, and zero for a creature that is bleeding', () => {
    expect(midPct({ minPct: 50, maxPct: 74 })).toBe(62);
    expect(midPct({ minPct: 100, maxPct: 100 })).toBe(100);
    expect(midPct({ minPct: -100, maxPct: -1 })).toBe(0);
  });
});
