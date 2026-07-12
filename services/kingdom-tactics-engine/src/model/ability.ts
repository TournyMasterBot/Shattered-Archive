/**
 * Standardized ability mechanics — the single interface every spell/song/skill's effect is
 * defined against. The DSL ability files carry only prose (name + help text), so these are
 * hand-authored balance data (see data/balance/abilities/), NOT generated. An ability with
 * no damage/maladiction/buff/utility payload is a no-op (marks the caster acted) — the shape
 * a not-yet-authored ability resolves to.
 */

/** The owner's three ability buckets (maps onto DSL SkillSpellEffects). */
export type AbilityCategory = 'combat' | 'utility' | 'support';

/** v1 single-target selection; area/group targeting is a later refinement. */
export type AbilityTargeting = 'self' | 'ally' | 'enemy';

/** From DSL AbilityUsage. */
export type AbilityUsageKind = 'active' | 'passive' | 'toggle';

/** Which unit attribute scales an effect. skills→str/dex, spell damage→int, saves→wis, songs→blend. */
export type ScalingAttr = 'str' | 'dex' | 'int' | 'wis' | 'con';

/** Auto-hit damage component (spells/offensive skills). `potency` is a multiplier on the
 * caster's resolved damage (v1); `scaling.power` records the intended attribute for later math. */
export interface AbilityDamageSpec {
  readonly potency: number;
  readonly damageType?: string;
}

/** Save-gated debuff: only lands when the target fails its save (caster int vs target wis). */
export interface AbilityMaladictionSpec {
  readonly statusKey: string;
  readonly duration: number;
  readonly potency?: number;
  /** SaveInput.saves — the maladiction's own save modifier. */
  readonly saves?: number;
  /** SaveInput.baseSave — hidden base-save boost/gimp. */
  readonly baseSave?: number;
}

/** Beneficial status on self or an ally — no save. */
export interface AbilityBuffSpec {
  readonly statusKey: string;
  readonly duration: number;
  readonly magnitude?: number;
  readonly target: 'self' | 'ally';
}

/** Restore hit points to the caster ('self') or an ally — no save, capped at the recipient's
 * max HP. The clerical cure line (CureLight…Heal). */
export interface AbilityHealSpec {
  /** Base HP restored. */
  readonly amount: number;
  readonly target: 'self' | 'ally';
  /** Optional bonus HP = floor(caster WIS × wisScale), so a wiser cleric heals more. Default 0. */
  readonly wisScale?: number;
}

/** Non-combat effect marker (movement, detection, transport…). v1 records intent; effect TBD. */
export interface AbilityUtilitySpec {
  readonly kind: string;
  readonly note?: string;
}

/** The full standardized mechanics definition for one ability. */
export interface AbilityMechanics {
  /** Catalog ability key (matches ABILITIES[].key). */
  readonly key: string;
  readonly category: AbilityCategory;
  readonly targeting: AbilityTargeting;
  readonly usage: AbilityUsageKind;
  readonly scaling: { readonly power?: ScalingAttr; readonly save?: ScalingAttr };
  readonly damage?: AbilityDamageSpec;
  readonly maladiction?: AbilityMaladictionSpec;
  readonly buff?: AbilityBuffSpec;
  readonly heal?: AbilityHealSpec;
  readonly utility?: AbilityUtilitySpec;
  /** 'authored' = a real definition; 'stub' = the no-op fallback for an unauthored ability. */
  readonly status: 'authored' | 'stub';
  /** Help-file-derived rationale for the authored mechanics (provenance). */
  readonly notes?: string;
}
