// apps/game-client/src/features/autoleveling/autoleveling-buff-catalog.ts

/**
 * Verified buff catalog — command ↔ GMCP affect-name pairs, checked against
 * 276 game-server logs (2026-09). The affect name is what GMCP `affect_data` /
 * `add_affect` reports (lowercase) — NOT the cast abbreviation:
 *   sanc → sanctuary · stone → stone skin · pass → pass door · fren → frenzy ·
 *   'detect inv' → detect invis
 *
 * `berserk` has no `affect` — it never registers one; gate it with "every N
 * ticks" instead.
 */

export interface BuffCatalogEntry {
  label: string;
  cmd: string;
  /** GMCP affect name, or '' for buffs the game never reports (berserk). */
  affect: string;
  /**
   * Seed for the row's in-combat action — sanctuary et al. cannot be recast in
   * combat, only quaffed/brandished. `<potion>` is a placeholder the user fills.
   */
  suggestInCombat?: string;
  /** Pre-check "let fall near level-up" — haste suppresses mana regen. */
  suggestHoldNearLevel?: boolean;
}

export const BUFF_CATALOG: BuffCatalogEntry[] = [
  { label: 'Sanctuary', cmd: "cast 'sanctuary'", affect: 'sanctuary', suggestInCombat: 'quaff <potion>' },
  { label: 'Haste', cmd: "cast 'haste'", affect: 'haste', suggestHoldNearLevel: true },
  { label: 'Frenzy', cmd: "cast 'frenzy'", affect: 'frenzy' },
  { label: 'Bless', cmd: "cast 'bless'", affect: 'bless' },
  { label: 'Armor', cmd: "cast 'armor'", affect: 'armor' },
  { label: 'Shield', cmd: "cast 'shield'", affect: 'shield' },
  { label: 'Stone Skin', cmd: "cast 'stone skin'", affect: 'stone skin' },
  { label: 'Pass Door', cmd: "cast 'pass door'", affect: 'pass door' },
  { label: 'Fly', cmd: "cast 'fly'", affect: 'fly' },
  { label: 'Detect Invis', cmd: "cast 'detect invis'", affect: 'detect invis' },
  { label: 'Detect Hidden', cmd: "cast 'detect hidden'", affect: 'detect hidden' },
  { label: 'Detect Good', cmd: "cast 'detect good'", affect: 'detect good' },
  { label: 'Detect Evil', cmd: "cast 'detect evil'", affect: 'detect evil' },
  { label: 'Detect Magic', cmd: "cast 'detect magic'", affect: 'detect magic' },
  { label: 'Blessing of Peace', cmd: "cast 'blessing of peace'", affect: 'blessing of peace' },
  { label: 'Ancestral Honor', cmd: "cast 'ancestral honor'", affect: 'ancestral honor' },
  { label: 'Imbue', cmd: "cast 'imbue' self", affect: 'imbue' },
  { label: 'Inspire', cmd: "cast 'inspire'", affect: 'inspire' },
  { label: 'Giant Strength', cmd: "cast 'giant strength'", affect: 'giant strength' },
  { label: 'Water Breathing', cmd: "cast 'water breathing'", affect: 'water breathing' },
  { label: 'Protection Good', cmd: "cast 'protection good'", affect: 'protection good' },
  { label: 'Protection Evil', cmd: "cast 'protection evil'", affect: 'protection evil' },
  { label: 'Protection Neutral', cmd: "cast 'protection neutral'", affect: 'protection neutral' },
  { label: 'Berserk', cmd: 'berserk', affect: '' },
];
