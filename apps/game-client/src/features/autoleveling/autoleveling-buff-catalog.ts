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

import type { AutoLevelCombatState, AutoLevelVitalsGate } from './autoleveling-types';

export interface BuffCatalogEntry {
  label: string;
  cmd: string;
  /** GMCP affect name, or '' for buffs the game never reports (berserk). */
  affect: string;
  /**
   * Seed for the row's in-combat action — a COMPLETE command only. No catalog entry uses it today: sanctuary et al. cannot be
   * recast in combat, only quaffed/brandished, but which item the player carries is theirs to say, and a seeded `quaff <potion>`
   * was sent to the game literally 23 times on 2026-11-14 (CMDTPL-01). The in-combat box shows a hint instead.
   */
  suggestInCombat?: string;
  /** Pre-check "let fall near level-up" — haste suppresses mana regen. */
  suggestHoldNearLevel?: boolean;
  /** The ability can only be used out of (`out`) or in (`in`) combat; seeds the row's combat state. */
  combatState?: AutoLevelCombatState;
  /** A vitals threshold the row starts with (a heal that is only worth casting when hurt); the player edits it. */
  suggestVitalsGate?: AutoLevelVitalsGate;
  /**
   * A heal or other condition-gated cast: no affect to wait for and no tick gate; it is sent whenever its conditions hold
   * (checked at the top of a round and after every fight). Without this an affect-less entry gets the tick gate (berserk).
   */
  conditionGated?: boolean;
  /** The game's own success line (lowercase, no final dot) for an ability with no GMCP affect to confirm it. */
  successLine?: string;
}

export const BUFF_CATALOG: BuffCatalogEntry[] = [
  { label: 'Sanctuary', cmd: "cast 'sanctuary'", affect: 'sanctuary' },
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
  // A heal, not an affect. Out of combat only (owner, 2026-11-14, decision D3: the engine enforces it whatever the game answers);
  // the success line is in the game-server logs of 2026-11-14 and 2026-11-18. Catalog only: never pre-filled.
  {
    label: 'Dark Heal',
    cmd: "cast 'dark heal'",
    affect: '',
    combatState: 'out',
    suggestVitalsGate: { stat: 'hp', op: 'below', pct: 70 },
    conditionGated: true,
    successLine: 'a dark healing fills your body',
  },
];
