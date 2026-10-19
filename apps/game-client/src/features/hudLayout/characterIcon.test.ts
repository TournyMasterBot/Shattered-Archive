import { CLASS_ICONS, RACE_ICONS, getCharacterIcon } from './characterIcon';

const graphemes = (s: string) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)];

describe('getCharacterIcon', () => {
  it('resolves a dragon race via class when class also matches (Talarien: Topaz dragon / Dragon)', () => {
    expect(getCharacterIcon({ raceName: 'Topaz dragon', className: 'Dragon' })).toBe('🐉');
  });

  it('prefers class over race when they diverge (Tyrinx: Pixie / Transmuter)', () => {
    expect(getCharacterIcon({ raceName: 'Pixie', className: 'Transmuter' })).toBe('🔮⚗️');
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

  it('gives Armsman a sword-and-shield pair — an icon may be more than one emoji', () => {
    // dagger (U+1F5E1) + shield (U+1F6E1), each with the emoji variation selector,
    // matching how Thief and Paladin already spell them individually.
    expect(getCharacterIcon({ className: 'Armsman' })).toBe('\u{1F5E1}️\u{1F6E1}️');
  });
});

describe('icon set guards', () => {
  const all = [...Object.entries(CLASS_ICONS), ...Object.entries(RACE_ICONS)];

  it('every class and race icon is one or two emoji (a pair at most)', () => {
    const bad = all.filter(([, icon]) => graphemes(icon).length < 1 || graphemes(icon).length > 2).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('every emoji that defaults to text style carries its emoji variation selector', () => {
    // Without U+FE0F, glyphs like ⚔ ☠ 🛡 render as flat monochrome text on some platforms.
    const bad = all
      .filter(([, icon]) => {
        const cps = [...icon];
        return cps.some(
          (c, i) =>
            /\p{Emoji}/u.test(c) &&
            !/\p{Emoji_Presentation}/u.test(c) &&
            !/[0-9#*]/.test(c) &&
            cps[i + 1] !== '️',
        );
      })
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('no two classes share an icon (each class must be distinguishable at a glance)', () => {
    const byIcon = new Map<string, string[]>();
    for (const [cls, icon] of Object.entries(CLASS_ICONS)) byIcon.set(icon, [...(byIcon.get(icon) ?? []), cls]);
    const dupes = [...byIcon.entries()].filter(([, classes]) => classes.length > 1);
    expect(dupes).toEqual([]);
  });
});

describe('chosen class icons', () => {
  it.each([
    ['battlerager', '🪓🛡️'], // requested: axe and shield
    ['armsman', '🗡️🛡️'],
    // Classes that previously shared an icon with another class:
    ['warrior', '⚔️'],
    ['dragonslayer', '⚔️🐉'],
    ['demon', '😈'],
    ['warlock', '😈🔥'],
    ['cleric', '✨🙏'],
    ['priest', '⛪🙏'],
    ['thief', '🗝️🗡️'],
    ['paladin', '🛡️✨'],
    ['anti-paladin', '🖤🛡️'],
  ])('%s → %s', (className, icon) => {
    expect(getCharacterIcon({ className })).toBe(icon);
  });
});

describe('chosen race icons (shown only when the class has no icon of its own)', () => {
  it.each([
    ['Shalonesti Elf', '🧝🌲'],
    ['Dark Elf', '🧝🌑'],
    ['Wild Elf', '🧝🌿'],
    ['Half Elf', '🧝🧑'],
    ['Sea Elf', '🧜'],
    ['Hill Dwarf', '⛏️🌄'],
    ['Mountain Dwarf', '⛏️🏔️'],
    ['Dark Dwarf', '⛏️🌑'],
    ['Gully Dwarf', '⛏️'],
    ['Giant Ogre', '👹🏔️'],
    ['Half Ogre', '👹🧑'],
    ['Ogre', '👹'],
  ])('%s → %s', (raceName, icon) => {
    expect(getCharacterIcon({ raceName, className: 'not-a-class' })).toBe(icon);
  });
});
