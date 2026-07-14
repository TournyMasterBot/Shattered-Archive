/**
 * Hand-authored ability mechanics registry — the standardized effect definition for each DSL
 * ability, keyed by catalog ability key (see data/dsl/abilities.ts). This is BALANCE DATA, not
 * generated: the DSL files carry only prose help text, so each entry is authored from that lore
 * (see the `notes` field for provenance).
 *
 * Coverage is filled in incrementally, by playable class kit (Warrior → Ranger → Assassin → Mage
 * → Cleric). Any key NOT present here resolves to a no-op stub (see resolve.ts), so an unauthored
 * ability simply consumes the caster's action with no effect — deterministic, sim-stable. Track
 * progress with `pnpm --filter @shatteredarchive/kingdom-tactics-engine ability:coverage`.
 *
 * Range note (enemy-targeted only, see AbilityMechanics.range): most skills/spells are "in room"
 * and set NO `range` — they inherit the caster's `attack.range` (melee 1, Mage cast 3). Only set it
 * for exceptions: an "adjacent-room" skill → 2 (see Charge); a ranged artillery spell (fireball,
 * blizzard, lightning bolt, the cones) → 5. Bows are NOT per-item here — bow reach is the Ranger
 * class kit's `attack.range` (4).
 *
 * v1 scope note: applied buff/maladiction STATUS keys (stunned/berserk/…) land on the token's
 * statuses[]; their downstream gameplay effects (a 'stunned' unit skipping activation, 'berserk'
 * raising attack) are read by turn-order/resolve in a FOLLOW-UP layer. Weapon masteries and other
 * passives are marked authored with no active payload (casting them is a no-op; they exist for
 * coverage + future passive wiring).
 */
import type { AbilityMechanics } from '../../../model/index.js';

/** Convenience builders keep the table terse and consistent. */
const passive = (
  key: string,
  category: AbilityMechanics['category'],
  power: AbilityMechanics['scaling']['power'],
  notes: string,
): AbilityMechanics => ({
  key,
  category,
  targeting: 'self',
  usage: 'passive',
  scaling: { power },
  status: 'authored',
  notes,
});

export const AUTHORED_MECHANICS: Record<string, AbilityMechanics> = {
  // ── Warrior kit — active combat skills ──
  Kick: {
    key: 'Kick',
    category: 'combat',
    targeting: 'enemy',
    usage: 'active',
    scaling: { power: 'str' },
    damage: { potency: 0.5 },
    status: 'authored',
    notes: 'An extra kick attack in combat — a lighter, opportunistic strike (potency 0.5).',
  },
  Charge: {
    key: 'Charge',
    category: 'combat',
    targeting: 'enemy',
    usage: 'active',
    scaling: { power: 'str' },
    damage: { potency: 1.5 },
    range: 2, // "adjacent-room" skill exception — a charge closes ground one tile beyond melee
    status: 'authored',
    notes: 'Mounted polearm charge — a heavy opening strike (potency 1.5).',
  },
  Bash: {
    key: 'Bash',
    category: 'combat',
    targeting: 'enemy',
    usage: 'active',
    scaling: { power: 'str' },
    damage: { potency: 0.75 },
    maladiction: { statusKey: 'stunned', duration: 1, saves: 0 },
    status: 'authored',
    notes: 'Brute-force attack that knocks the foe down: some damage + a save-gated stun.',
  },

  // ── Warrior kit — maladictions (control) ──
  Disarm: {
    key: 'Disarm',
    category: 'combat',
    targeting: 'enemy',
    usage: 'active',
    scaling: { power: 'dex' },
    maladiction: { statusKey: 'disarmed', duration: 2, saves: 0 },
    status: 'authored',
    notes: 'Relieve the opponent of their weapon (save-gated); showy and unreliable, no damage.',
  },
  Trip: {
    key: 'Trip',
    category: 'combat',
    targeting: 'enemy',
    usage: 'active',
    scaling: { power: 'dex' },
    maladiction: { statusKey: 'tripped', duration: 1, saves: 0 },
    status: 'authored',
    notes: 'Bring the opponent to the ground (save-gated). Lore: no effect on flying targets (TODO).',
  },

  // ── Warrior kit — self buff & ally support ──
  Berserk: {
    key: 'Berserk',
    category: 'support',
    targeting: 'self',
    usage: 'active',
    scaling: { power: 'str' },
    buff: { statusKey: 'berserk', duration: 3, magnitude: 1, target: 'self' },
    status: 'authored',
    notes: 'Insane combat rage: a surge of prowess + magic resistance for a few turns.',
  },
  Rescue: {
    key: 'Rescue',
    category: 'support',
    targeting: 'ally',
    usage: 'active',
    scaling: { power: 'str' },
    buff: { statusKey: 'rescued', duration: 1, target: 'ally' },
    status: 'authored',
    notes: 'Interpose to take an ally\'s place in a fight — marks the ally guarded for a turn.',
  },

  // ── Cleric kit — divine healing (the cure line) ──
  CureLight: {
    key: 'CureLight',
    category: 'support',
    targeting: 'ally',
    usage: 'active',
    scaling: { power: 'wis' },
    heal: { amount: 8, target: 'ally', wisScale: 0.5 },
    status: 'authored',
    notes: 'Cure Light Wounds — a modest divine heal on a wounded ally (or self); scales with the cleric\'s wisdom.',
  },
  CureSerious: {
    key: 'CureSerious',
    category: 'support',
    targeting: 'ally',
    usage: 'active',
    scaling: { power: 'wis' },
    heal: { amount: 14, target: 'ally', wisScale: 0.75 },
    status: 'authored',
    notes: 'Cure Serious Wounds — a stronger cure than the light version.',
  },
  CureCritical: {
    key: 'CureCritical',
    category: 'support',
    targeting: 'ally',
    usage: 'active',
    scaling: { power: 'wis' },
    heal: { amount: 20, target: 'ally', wisScale: 1 },
    status: 'authored',
    notes: 'Cure Critical Wounds — a major cure for a grievously wounded ally.',
  },
  Heal: {
    key: 'Heal',
    category: 'support',
    targeting: 'ally',
    usage: 'active',
    scaling: { power: 'wis' },
    heal: { amount: 30, target: 'ally', wisScale: 1.25 },
    status: 'authored',
    notes: 'Heal — the greatest divine restoration, far beyond the lesser cures.',
  },

  // ── Warrior kit — passive combat proficiencies ──
  EnhancedDamage: passive('EnhancedDamage', 'combat', 'str', 'Chance at bonus damage on each hit.'),
  SecondAttack: passive('SecondAttack', 'combat', 'dex', 'Chance at a second strike each round.'),
  ThirdAttack: passive('ThirdAttack', 'combat', 'dex', 'Chance at a third strike each round.'),
  DualWield: passive('DualWield', 'combat', 'dex', 'Fight effectively with a weapon in each hand.'),
  BlindFighting: passive('BlindFighting', 'combat', 'dex', 'Fight without penalty when unable to see.'),
  HandToHand: passive('HandToHand', 'combat', 'str', 'Unarmed combat proficiency.'),

  // ── Warrior kit — passive defenses ──
  Parry: passive('Parry', 'support', 'dex', 'Deflect attacks with a weapon; more reliable than dodge.'),
  ShieldBlock: passive('ShieldBlock', 'support', 'str', 'Parry attacks with a shield.'),
  Dodge: passive('Dodge', 'support', 'dex', 'Agility to make many blows miss entirely.'),

  // ── Warrior kit — weapon masteries (passive) ──
  Axe: passive('Axe', 'combat', 'str', 'Axe weapon proficiency.'),
  Dagger: passive('Dagger', 'combat', 'dex', 'Dagger weapon proficiency.'),
  Flail: passive('Flail', 'combat', 'str', 'Flail weapon proficiency.'),
  Mace: passive('Mace', 'combat', 'str', 'Mace weapon proficiency.'),
  Polearm: passive('Polearm', 'combat', 'str', 'Polearm weapon proficiency.'),
  Spear: passive('Spear', 'combat', 'str', 'Spear weapon proficiency.'),
  Sword: passive('Sword', 'combat', 'str', 'Sword weapon proficiency.'),
  Whip: passive('Whip', 'combat', 'dex', 'Whip weapon proficiency.'),
  Staff: passive('Staff', 'combat', 'str', 'Staff weapon proficiency.'),
};
