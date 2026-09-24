import { getCharacterIcon } from './characterIcon';

describe('getCharacterIcon', () => {
  it('resolves a dragon race via class when class also matches (Talarien: Topaz dragon / Dragon)', () => {
    expect(getCharacterIcon({ raceName: 'Topaz dragon', className: 'Dragon' })).toBe('🐉');
  });

  it('prefers class over race when they diverge (Tyrinx: Pixie / Transmuter)', () => {
    expect(getCharacterIcon({ raceName: 'Pixie', className: 'Transmuter' })).toBe('🔮');
  });

  it('falls back to race when class has no mapped icon', () => {
    expect(getCharacterIcon({ raceName: 'Pixie', className: 'not-a-real-class' })).toBe('🧚');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(getCharacterIcon({ raceName: '  TOPAZ DRAGON  ', className: null })).toBe('🐉');
  });

  it('returns null when neither race nor class match anything', () => {
    expect(getCharacterIcon({ raceName: 'not-a-race', className: 'not-a-class' })).toBeNull();
  });

  it('returns null when both are missing', () => {
    expect(getCharacterIcon({})).toBeNull();
  });
});
