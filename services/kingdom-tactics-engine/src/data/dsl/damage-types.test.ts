import {
  damageCategory,
  elementalGroup,
  resistMatches,
} from './damage-types.js';
import { armorClassMultiplier } from '../balance/armor.js';

describe('damageCategory', () => {
  it('classifies physical clusters as physical', () => {
    expect(damageCategory('Slash')).toBe('physical'); // slashing
    expect(damageCategory('Pierce')).toBe('physical'); // piercing
    expect(damageCategory('Crush')).toBe('physical'); // blunt
  });
  it('classifies the magic cluster as magic', () => {
    expect(damageCategory('Magic')).toBe('magic');
    expect(damageCategory('Flame')).toBe('magic');
    expect(damageCategory('Divine')).toBe('magic');
  });
  it('defaults unknown types to physical', () => {
    expect(damageCategory('Nonsense')).toBe('physical');
  });
});

describe('elementalGroup', () => {
  it('maps elemental damage types to their group', () => {
    expect(elementalGroup('Flame')).toBe('fire');
    expect(elementalGroup('Chill')).toBe('cold');
    expect(elementalGroup('Shock')).toBe('lightning');
  });
  it('returns null for non-elemental types', () => {
    expect(elementalGroup('Slash')).toBeNull();
    expect(elementalGroup('Divine')).toBeNull();
  });
});

describe('resistMatches (dragonskin resists line up with damage types)', () => {
  it('matches elemental resists to their damage group', () => {
    expect(resistMatches('Fire', 'Flame')).toBe(true);
    expect(resistMatches('Fire', 'FlamingBite')).toBe(true);
    expect(resistMatches('Cold', 'Chill')).toBe(true);
    expect(resistMatches('Lightning', 'Shock')).toBe(true);
    expect(resistMatches('Acid', 'AcidicBite')).toBe(true);
  });
  it('does not match across elements', () => {
    expect(resistMatches('Fire', 'Chill')).toBe(false);
    expect(resistMatches('Cold', 'Flame')).toBe(false);
  });
  it('Physical resist covers any physical damage type', () => {
    expect(resistMatches('Physical', 'Slash')).toBe(true);
    expect(resistMatches('Physical', 'Crush')).toBe(true);
    expect(resistMatches('Physical', 'Flame')).toBe(false); // magic
  });
  it('is case-insensitive and matches a bare type name', () => {
    expect(resistMatches('drain', 'Drain')).toBe(true);
    expect(resistMatches('flame', 'Flame')).toBe(true);
  });
  it('non-damage resists (Poison/Charm) do not match any damage type', () => {
    expect(resistMatches('Poison', 'Flame')).toBe(false);
    expect(resistMatches('Charm', 'Slash')).toBe(false);
  });
});

describe('armorClassMultiplier', () => {
  it('mirrors the DSL ArmorCalculators scale', () => {
    expect(armorClassMultiplier('Cloth')).toBe(0);
    expect(armorClassMultiplier('Leather')).toBe(0.25);
    expect(armorClassMultiplier('Studded')).toBe(0.5);
    expect(armorClassMultiplier('Chain')).toBe(0.75);
    expect(armorClassMultiplier('Plate')).toBe(1);
  });
  it('defaults unknown/absent armor to 0 (Cloth)', () => {
    expect(armorClassMultiplier(null)).toBe(0);
    expect(armorClassMultiplier(undefined)).toBe(0);
    expect(armorClassMultiplier('Mithril')).toBe(0);
  });
});
