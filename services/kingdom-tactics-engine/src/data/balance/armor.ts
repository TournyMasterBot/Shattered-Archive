// Distilled from Server.Dsl/Calculators/ArmorCalculators.cs. Armor type is the primary
// defensive-bonus factor in the DSL (size gates equipment eligibility, NOT defense), so
// the damage resolver keys its armor mitigation off a unit's resolved armorType. Keep the
// multipliers aligned with the C# GetArmorClassMultiplier; the slot weights are surfaced
// for future per-slot equipment modeling but are not used by the grid resolver yet.

/** Armor-class multiplier by DSL armor type (Cloth 0.0 → Plate 1.0). */
export const ARMOR_CLASS_MULTIPLIERS: Record<string, number> = {
  Cloth: 0.0,
  Leather: 0.25,
  Studded: 0.5,
  Chain: 0.75,
  Plate: 1.0,
};

/** Slot weight (Body counts triple; head/shield/legs/about-body double; rest single). */
export const ARMOR_SLOT_MULTIPLIERS: Record<string, number> = {
  Body: 3,
  Head: 2,
  Shield: 2,
  Legs: 2,
  AboutBody: 2,
  Hands: 1,
  Arms: 1,
  Feet: 1,
};

/** Multiplier for an armor type, defaulting to Cloth (0) for unknown/absent types. */
export function armorClassMultiplier(armorType: string | null | undefined): number {
  if (!armorType) return 0;
  return ARMOR_CLASS_MULTIPLIERS[armorType] ?? 0;
}
