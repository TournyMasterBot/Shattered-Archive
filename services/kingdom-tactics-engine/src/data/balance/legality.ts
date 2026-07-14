/**
 * Race × class legality for army building — enforces the DSL's class restrictions
 * on top of the distilled attributes (class-attributes.ts):
 *
 *  - `raceRestrictions` is a FORBID list: a race in it can never be that class.
 *  - `csr.requiresRaces` is an ALLOW list (opposite polarity): when non-empty, the
 *    race MUST be in it (e.g. Bladesinger → elf subraces, Runesmith → dwarves).
 *  - a CSR (`isCSR`) reclass is additionally gated to its `Affiliation`: the army fights
 *    for a SINGLE allegiance (clan/kingdom/faction, or loner/renegade), and a CSR class is
 *    legal only if that allegiance is one it requires. Religion (god) differences within a
 *    faction are rolled up into the allegiance — the DSL god requirements always co-occur
 *    with an allegiance requirement, so allegiance alone is the gate. A CSR that requires no
 *    allegiance (e.g. Monk) imposes no allegiance gate. `csr.requiresClasses` is the reclass's
 *    own base class — inherent to picking the reclass, not something the context must supply.
 *
 * Pure module (no provider/DOM/Node deps) so the reducer, setup, AI, and client can
 * all share one legality definition. Single-select per unit: one race + one class.
 */
import { CLASS_ATTRIBUTES, type ClassAttributes } from '../dsl/class-attributes.js';
import { MORTAL_RACES } from '../dsl/races.js';

/** The affiliation context a team/army carries — a single allegiance gates its CSR reclasses. */
export interface RaceClassContext {
  /** The team's one allegiance (clan/kingdom/faction key, or loner/renegade). Undefined = unaffiliated. */
  readonly allegianceKey?: string;
}

const CLASS_BY_KEY = new Map<string, ClassAttributes>(
  CLASS_ATTRIBUTES.map((c) => [c.key, c]),
);

/**
 * Whether the team's single allegiance satisfies a CSR class's affiliation gate. A class with
 * no allegiance requirement (e.g. Monk) is ungated; otherwise the team's allegiance must be one
 * the class requires. God requirements are folded into allegiance (they never occur without one).
 */
function contextSatisfiesCsr(
  csr: ClassAttributes['csr'],
  ctx: RaceClassContext | undefined,
): boolean {
  if (csr.requiresAllegiances.length === 0) return true;
  return !!ctx?.allegianceKey && csr.requiresAllegiances.includes(ctx.allegianceKey);
}

/**
 * Can `raceKey` be `classKey`, given the army's affiliation `ctx`? Unknown class → false.
 */
export function isLegalRaceClass(
  raceKey: string,
  classKey: string,
  ctx?: RaceClassContext,
): boolean {
  const attr = CLASS_BY_KEY.get(classKey);
  if (!attr) return false;
  // FORBID list.
  if (attr.raceRestrictions.includes(raceKey)) return false;
  // ALLOW list (only when the class declares one).
  if (attr.csr.requiresRaces.length > 0 && !attr.csr.requiresRaces.includes(raceKey)) return false;
  // CSR affiliation gate.
  if (attr.isCSR && !contextSatisfiesCsr(attr.csr, ctx)) return false;
  return true;
}

/** All class keys `raceKey` may legally take under `ctx`. */
export function legalClassesForRace(raceKey: string, ctx?: RaceClassContext): string[] {
  return CLASS_ATTRIBUTES.filter((c) => isLegalRaceClass(raceKey, c.key, ctx)).map((c) => c.key);
}

/** All mortal race keys that may legally take `classKey` under `ctx`. */
export function legalRacesForClass(classKey: string, ctx?: RaceClassContext): string[] {
  return MORTAL_RACES.filter((r) => isLegalRaceClass(r.key, classKey, ctx)).map((r) => r.key);
}
