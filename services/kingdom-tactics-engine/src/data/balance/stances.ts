/**
 * Combat STANCES — a posture a unit holds until changed, set as a FREE minor action (no
 * move/action cost, not subject to the one-unit-per-turn lock; see the reducer). Each stance
 * carries four modifiers so it bites in BOTH the online/hooked avoidance path and local
 * deterministic play:
 *
 *  - `toHitMod`  — lowers the DEFENDER's avoidance when THIS unit attacks (online only).
 *  - `evasionMod` — raises THIS unit's own avoidance when it is attacked (online only).
 *  - `damageDealtMod` — scales damage THIS unit deals (both paths, via resolveDamage).
 *  - `damageTakenMod` — scales damage THIS unit takes (both paths, via resolveDamage).
 *
 * `normal` is all-zero (a true no-op), so units default to it and existing matches/sims are
 * byte-identical. Offensive/Defensive/Normal are general; the three Brewmaster stances are
 * gated to `classKey === 'Brewmaster'` (their effects are distilled from Brewmaster.cs Notes).
 * Authored balance data — the single tuning surface for stances.
 */

export type StanceKey =
  | 'normal'
  | 'offensive'
  | 'defensive'
  | 'drunken-monkey'
  | 'sloshing'
  | 'cripple';

export interface StanceModifier {
  readonly key: StanceKey;
  readonly name: string;
  /** Reduces the defender's avoidance when THIS unit attacks (offensive +, defensive −). */
  readonly toHitMod: number;
  /** Adjusts THIS unit's own avoidance when it is attacked (offensive −, defensive +). */
  readonly evasionMod: number;
  /** Multiplicative bonus to damage THIS unit deals (e.g. Cripple +2.5%). */
  readonly damageDealtMod: number;
  /** Multiplicative change to damage THIS unit takes (offensive +, defensive −). */
  readonly damageTakenMod: number;
  /** When set, only that class may adopt the stance; undefined = general (any unit). */
  readonly classKey?: string;
  /** Short player-facing blurb. */
  readonly note: string;
}

export const STANCES: Record<StanceKey, StanceModifier> = {
  normal: {
    key: 'normal', name: 'Normal',
    toHitMod: 0, evasionMod: 0, damageDealtMod: 0, damageTakenMod: 0,
    note: 'A balanced blend of offense and defense.',
  },
  offensive: {
    key: 'offensive', name: 'Offensive',
    toHitMod: 0.1, evasionMod: -0.1, damageDealtMod: 0.1, damageTakenMod: 0.1,
    note: 'Press the attack — more likely to hit and hit harder, but easier to hit in return.',
  },
  defensive: {
    key: 'defensive', name: 'Defensive',
    toHitMod: -0.1, evasionMod: 0.1, damageDealtMod: -0.1, damageTakenMod: -0.1,
    note: 'Guard up — less likely to hit and softer strikes, but harder to hit and better defended.',
  },
  'drunken-monkey': {
    key: 'drunken-monkey', name: 'Drunken Monkey',
    toHitMod: 0, evasionMod: 0.05, damageDealtMod: -0.2, damageTakenMod: 0,
    classKey: 'Brewmaster',
    note: 'A goofy taunting stance — hard to hit (+5% opponent miss) but weak on damage.',
  },
  sloshing: {
    key: 'sloshing', name: 'Sloshing Style',
    toHitMod: 0.05, evasionMod: 0, damageDealtMod: 0.05, damageTakenMod: 0,
    classKey: 'Brewmaster',
    note: 'Awkward sways open the guard — a chance at extra, insanely powerful strikes.',
  },
  cripple: {
    key: 'cripple', name: 'Cripple Style',
    toHitMod: 0, evasionMod: 0.025, damageDealtMod: 0.025, damageTakenMod: 0,
    classKey: 'Brewmaster',
    note: 'Feigned injury — a blend of offensive power (+2.5% damage) and defense (+2.5% opponent miss).',
  },
};

/** The default stance every unit holds until it adopts another. */
export const DEFAULT_STANCE: StanceKey = 'normal';

/** Resolve a stance key (or missing) to its modifier; unknown/absent → normal. */
export function stanceMod(key: StanceKey | undefined): StanceModifier {
  return (key && STANCES[key]) || STANCES.normal;
}

/** Stances a given class may adopt: every general stance plus any gated to that class. */
export function stancesForClass(classKey: string): StanceModifier[] {
  return Object.values(STANCES).filter((s) => s.classKey === undefined || s.classKey === classKey);
}

/** Whether `classKey` may adopt the stance (general stances always legal). */
export function isStanceLegalFor(key: StanceKey, classKey: string): boolean {
  const s = STANCES[key];
  return !!s && (s.classKey === undefined || s.classKey === classKey);
}
