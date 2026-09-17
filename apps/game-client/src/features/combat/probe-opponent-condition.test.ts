import { ProbeOpponentConditionLine } from './probe-opponent-condition';

describe('ProbeOpponentConditionLine', () => {
  it('extracts a plain-text label and status', () => {
    const result = ProbeOpponentConditionLine('The troll is in excellent condition.');
    expect(result?.label).toBe('The troll');
    expect(result?.pct).toBe(100);
    expect(result?.statusText).toBe('100%');
  });

  it('strips ANSI color codes out of a colored mob name (the merman bug)', () => {
    const result = ProbeOpponentConditionLine('A \x1b[0;36mmerman\x1b[0m is in excellent condition.');
    expect(result?.label).toBe('A merman');
    expect(result?.label).not.toContain('\x1b');
    expect(result?.label).not.toContain('[0;36m');
  });

  it('trims a trailing "has" verb', () => {
    const result = ProbeOpponentConditionLine('The orc has quite a few wounds.');
    expect(result?.label).toBe('The orc');
    expect(result?.pct).toBe(62);
  });

  it('returns null when no condition phrase is present', () => {
    expect(ProbeOpponentConditionLine('You swing your sword at the orc.')).toBeNull();
  });

  it('returns null when a gate keyword appears without a matching bucket phrase', () => {
    // Contains "excellent condition" as a gate hit but not the exact bucket phrase.
    expect(ProbeOpponentConditionLine('That was an excellent condition to fight in.')).toBeNull();
  });
});
