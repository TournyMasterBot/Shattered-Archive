// Distilled by hand from Server.Dsl/Calculators/DamageTypeGroupings.cs — keep in sync
// with the C# groupings if new DslDamageType values are added there. NOT emitted by the
// codegen (the groupings are small, stable, and hand-curated), so edit here directly.
//
// A damage type (an attacker's `damageType`, e.g. 'Flame') classifies both its physical/
// magic category and any elemental group, and drives defender resistance matching so DSL
// dragonskin resists (Fire/Cold/Lightning/Acid/Physical/Drain…) line up automatically.

/** Physical clusters (map to the P/B/S armor categories in the DSL calculator). */
export const PIERCING: readonly string[] = [
  'Bite', 'Charge', 'Grep', 'Peck', 'Pierce', 'Stab', 'Sting', 'Thrust',
];
export const BLUNT: readonly string[] = [
  'Beating', 'Blast', 'Crush', 'Pound', 'Punch', 'Slap', 'Slime', 'Smash', 'Suction', 'Thwack',
];
export const SLASHING: readonly string[] = [
  'Claw', 'Cleave', 'Scratch', 'Slash', 'Slice', 'Whip',
];

/** Magic cluster (the "E"/energy category). */
export const MAGIC: readonly string[] = [
  'AcidicBite', 'Divine', 'Drain', 'Flame', 'FlamingBite', 'Chill', 'FreezingBite',
  'Magic', 'Shock', 'ShockingBite', 'Wrath',
];

/** Elemental subsets of MAGIC (used by elemental protections/resistances). */
export const FIRE: readonly string[] = ['Flame', 'FlamingBite'];
export const COLD: readonly string[] = ['Chill', 'FreezingBite'];
export const LIGHTNING: readonly string[] = ['Shock', 'ShockingBite'];
/** Acid isn't a grouping in the C# yet, but the AcidicBite type + Acid dragonskin resist
 * pair up, so surface it here for resistMatches. */
export const ACID: readonly string[] = ['AcidicBite'];

const PHYSICAL_ALL = new Set<string>([...PIERCING, ...BLUNT, ...SLASHING]);
const MAGIC_ALL = new Set<string>(MAGIC);

export type DamageCategory = 'physical' | 'magic';
export type ElementalGroup = 'fire' | 'cold' | 'lightning';

/** Broad P/B/S vs magic classification. Unknown types default to physical. */
export function damageCategory(type: string): DamageCategory {
  return MAGIC_ALL.has(type) ? 'magic' : 'physical';
}

/** The elemental group of a damage type, or null if non-elemental. */
export function elementalGroup(type: string): ElementalGroup | null {
  if (FIRE.includes(type)) return 'fire';
  if (COLD.includes(type)) return 'cold';
  if (LIGHTNING.includes(type)) return 'lightning';
  return null;
}

/**
 * Does a defender resistance string (e.g. 'Fire', 'Physical', 'Acid', 'Drain' — as found
 * on REMORT_RACES / race-attributes) apply against an incoming `damageType`? Case-insensitive.
 * Resists with no damage-type analog here (Poison/Charm/Light/Harm — they gate saves, not
 * damage) simply don't match and fall through to false.
 */
export function resistMatches(resist: string, type: string): boolean {
  switch (resist.toLowerCase()) {
    case 'fire': return FIRE.includes(type);
    case 'cold': return COLD.includes(type);
    case 'lightning': return LIGHTNING.includes(type);
    case 'acid': return ACID.includes(type);
    case 'drain': return type === 'Drain';
    case 'physical': return damageCategory(type) === 'physical';
    case 'magic': return damageCategory(type) === 'magic';
    case 'piercing': return PIERCING.includes(type);
    case 'blunt': return BLUNT.includes(type);
    case 'slashing': return SLASHING.includes(type);
    default: return resist.toLowerCase() === type.toLowerCase();
  }
}
