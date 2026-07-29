import { cardValue, formatDeck, parseDeck, validateDeck } from './deck.js';

describe('parseDeck', () => {
  it('trims whitespace and drops blanks', () => {
    expect(parseDeck(' 1 , 2 ,, 3 ')).toEqual(['1', '2', '3']);
  });

  it('drops duplicates, keeping the first occurrence for display order', () => {
    expect(parseDeck('3,1,3,2,1')).toEqual(['3', '1', '2']);
  });

  it('round-trips through formatDeck', () => {
    expect(parseDeck(formatDeck(['?', '☕', '1']))).toEqual(['?', '☕', '1']);
  });
});

describe('validateDeck', () => {
  it('accepts a normal deck', () => {
    expect(validateDeck(['1', '2', '3'])).toBeUndefined();
  });

  it('rejects too few, too many, and over-long cards', () => {
    expect(validateDeck(['1'])).toBe('A deck needs at least 2 cards.');
    expect(validateDeck(Array.from({ length: 21 }, (_, i) => String(i)))).toBe('A deck can hold at most 20 cards.');
    expect(validateDeck(['1', 'toolongcard'])).toBe('Card "toolongcard" is longer than 6 characters.');
  });
});

describe('cardValue', () => {
  it('reads numeric cards, including decimals', () => {
    expect(cardValue('0.5')).toBe(0.5);
    expect(cardValue('100')).toBe(100);
  });

  it('treats the escape-hatch cards as non-numeric so they never skew the average', () => {
    expect(cardValue('?')).toBeNull();
    expect(cardValue('☕')).toBeNull();
    expect(cardValue('XL')).toBeNull();
  });
});
