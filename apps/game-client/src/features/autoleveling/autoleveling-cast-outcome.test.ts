import { classifyFailureLine, isSuccessLine, plainLine } from './autoleveling-cast-outcome';

describe('classifyFailureLine', () => {
  it.each([
    ['You lost your concentration.', 'failed'],
    ["You can't concentrate enough.", 'no-mana'],
    ["You aren't fighting anyone.", 'not-fighting'],
    ['You do not have that potion.', 'no-item'],
  ] as const)('%s is %s', (line, outcome) => expect(classifyFailureLine(line)).toBe(outcome));

  it('reads through colour codes, case and spacing', () => {
    expect(classifyFailureLine('\x1b[1;31mYou lost your  concentration.\x1b[0m')).toBe('failed');
    expect(classifyFailureLine('  YOU LOST YOUR CONCENTRATION  ')).toBe('failed');
  });

  it('does not match a longer line that merely contains the words, or other text', () => {
    expect(classifyFailureLine('You lost your concentration on the lecture and left.')).toBeNull();
    expect(classifyFailureLine('Your kick misses an insane half elf.')).toBeNull();
    expect(classifyFailureLine('')).toBeNull();
    expect(classifyFailureLine(undefined as unknown as string)).toBeNull();
  });
});

describe('isSuccessLine', () => {
  it('matches the ability success line exactly, ignoring colour, case and the final dot', () => {
    expect(isSuccessLine('A dark healing fills your body.', 'a dark healing fills your body')).toBe(true);
    expect(isSuccessLine('\x1b[32mA dark healing fills your body.\x1b[0m', 'a dark healing fills your body')).toBe(true);
  });

  it('is false for another line, and false when the ability has no success line', () => {
    expect(isSuccessLine('A dark healing fills the room.', 'a dark healing fills your body')).toBe(false);
    expect(isSuccessLine('A dark healing fills your body.', undefined)).toBe(false);
    expect(isSuccessLine('A dark healing fills your body.', '')).toBe(false);
  });
});

describe('plainLine', () => {
  it('normalises for matching', () => {
    expect(plainLine('\x1b[0mHello   World.\x1b[0m')).toBe('hello world');
    expect(plainLine(undefined as unknown as string)).toBe('');
  });
});
