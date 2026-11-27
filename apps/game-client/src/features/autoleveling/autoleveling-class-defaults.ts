// apps/game-client/src/features/autoleveling/autoleveling-class-defaults.ts

/**
 * Pre-populated buffs and fight commands for a chosen class — pure, no storage.
 *
 * The wizard seeds these only when the player has NO saved set for the area (buffs) or the (area, class)
 * (fight commands); a saved set, even an emptied one, always wins (SETTINGS-06). Seeded rows live in the draft
 * and are written only when the player first edits them.
 *
 * Sources: the class's real abilities from the served catalog (the DSL data), and the log-verified
 * BUFF_CATALOG for the exact command and GMCP affect of a buff. Known limits: about a quarter of abilities
 * carry no semantic group in the catalog, so fight picks lean on COMBAT_SKILL_NAMES for skills; the player
 * edits whatever is wrong.
 */

import type { AutoPilotAbility } from './autoleveling-content-types';
import { cooldownSecFromLag, refreshTicksFromDuration } from './autoleveling-lag';
import { BUFF_CATALOG, type BuffCatalogEntry } from './autoleveling-buff-catalog';
import { COMBAT_SKILL_NAMES } from './autoleveling-classes';
import type { BuffRow, FightRow } from './autoleveling-user-data';

/** Recast interval for a buff that never reports a GMCP affect (berserk). One game tick is about 41 s. */
export const DEFAULT_REFRESH_TICKS = 6;

/** How many fight commands a class gets by default. */
export const DEFAULT_FIGHT_ROWS = 3;

/**
 * The buffs worth pre-filling for leveling: protection and damage. Detections, travel and
 * alignment-protection buffs stay opt-in (the player adds them from the catalog).
 */
/**
 * Abilities that are never pre-filled for any class (owner, 2026-11-14 live test; decided per list on 2026-11-18). Kept as two
 * lists on purpose: the buff pre-fill and the fight pre-fill each enforce their own. The manual picker still offers them.
 */
export const NEVER_DEFAULT_BUFFS: readonly string[] = ['fog', 'dispel fog'];
export const NEVER_DEFAULT_FIGHTS: readonly string[] = ['fog', 'dispel fog'];

export const DEFAULT_BUFF_LABELS: readonly string[] = [
  'Sanctuary',
  'Armor',
  'Shield',
  'Stone Skin',
  'Bless',
  'Frenzy',
  'Haste',
  'Giant Strength',
  'Berserk',
];

/** How a buff row decides to recast: when its affect is missing, every N ticks, or every round. */
export type BuffGateMode = 'affect' | 'ticks' | 'always';

/**
 * The row after the player switches its recast mode. Built by spreading the existing row and removing only what belongs to the
 * old mode alone (`affect`, `refreshTicks`, `inCombatCmd`, `holdNearLevel`), so every other field - the vitals and enemy gates,
 * the fire limit, the combat state, the retry switch, `disabled`, `unverified` and any field added later - survives a switch
 * (SETTINGS-07). It used to be rebuilt from named fields and silently dropped `vitalsGate` and `onceKey`.
 */
export function buffRowForGate(b: BuffRow, gate: BuffGateMode): BuffRow {
  const { affect: _affect, refreshTicks: _ticks, inCombatCmd: _inCombat, holdNearLevel: _hold, ...common } = b;
  if (gate === 'ticks') return { ...common, refreshTicks: b.refreshTicks ?? DEFAULT_REFRESH_TICKS };
  if (gate === 'always') return { ...common };
  // 'affect' keeps the affect name and the in-combat / hold extras
  return {
    ...common,
    affect: b.affect ?? '',
    ...(b.inCombatCmd ? { inCombatCmd: b.inCombatCmd } : {}),
    ...(b.holdNearLevel ? { holdNearLevel: true } : {}),
  };
}

/**
 * A buff row from a verified catalog entry: command, affect gate, in-combat suggestion, hold-near-level. A tick-gated entry (berserk) recasts every
 * `duration - 1` ticks when the class feed knows the ability's duration (`timing`), else every DEFAULT_REFRESH_TICKS. Rows already saved are never touched.
 */
export function buffRowFromCatalog(entry: BuffCatalogEntry, timing?: Pick<AutoPilotAbility, 'durationTicks'>): BuffRow {
  const row: BuffRow = { label: entry.label, cmd: entry.cmd };
  if (entry.affect) {
    row.affect = entry.affect;
    if (entry.suggestInCombat) row.inCombatCmd = entry.suggestInCombat;
    if (entry.suggestHoldNearLevel) row.holdNearLevel = true;
  } else if (!entry.conditionGated) {
    row.refreshTicks = refreshTicksFromDuration(timing?.durationTicks, DEFAULT_REFRESH_TICKS);
  }
  if (entry.combatState) row.combatState = entry.combatState;
  if (entry.suggestVitalsGate) row.vitalsGate = { ...entry.suggestVitalsGate };
  return row;
}

const lc = (s: string) => s.trim().toLowerCase();

/** An ability is usable at the character's level; an unknown level means no cap. */
const usable = (a: AutoPilotAbility, charLevel: number | null) => charLevel == null || a.level <= charLevel;

/**
 * The class's verified leveling buffs: every DEFAULT_BUFF_LABELS entry whose label or affect names one of the
 * class's abilities, in the order of DEFAULT_BUFF_LABELS, once each. A buff the class only gets at a LATER level
 * is listed too but PAUSED (`disabled`): players can apply it another way meanwhile (quaff a potion, use a wand
 * or staff), so it stays visible, but its `cast` command is not sent until they define how and resume it.
 * A buff the class never gets is not listed (the player can still add one by hand).
 */
export function defaultBuffRows(abilities: readonly AutoPilotAbility[], charLevel: number | null): BuffRow[] {
  const levelOf = new Map<string, number>();
  const abilityOf = new Map<string, AutoPilotAbility>();
  for (const a of abilities) {
    const name = lc(a.name);
    levelOf.set(name, Math.min(a.level, levelOf.get(name) ?? Infinity));
    if (!abilityOf.has(name)) abilityOf.set(name, a);
  }
  const rows: BuffRow[] = [];
  for (const label of DEFAULT_BUFF_LABELS) {
    const entry = BUFF_CATALOG.find((c) => c.label === label);
    if (!entry) continue;
    if (NEVER_DEFAULT_BUFFS.includes(lc(entry.label)) || NEVER_DEFAULT_BUFFS.includes(lc(entry.affect))) continue;
    const level = levelOf.get(lc(entry.label)) ?? (entry.affect ? levelOf.get(lc(entry.affect)) : undefined);
    if (level === undefined) continue;
    const row = buffRowFromCatalog(entry, abilityOf.get(lc(entry.label)) ?? (entry.affect ? abilityOf.get(lc(entry.affect)) : undefined));
    rows.push(charLevel == null || level <= charLevel ? row : { ...row, disabled: true });
  }
  return rows;
}

/** The command the fight loop sends for an ability (the same shape the manual "add" produces). */
export function fightCommandFor(ability: Pick<AutoPilotAbility, 'name' | 'type'>): string {
  const name = lc(ability.name);
  return ability.type === 'skill' ? name : `cast '${name}' {name}`;
}

/**
 * Fight commands for a class from its offensive abilities (already filtered by the caller with
 * classOffensiveAbilities): up to DEFAULT_FIGHT_ROWS, the strongest spells and songs first (highest level at or
 * below the character's), then known combat skills in COMBAT_SKILL_NAMES order. Cooldown 0; the caller fills in a
 * learned cooldown when one exists.
 */
export function defaultFightRows(offense: readonly AutoPilotAbility[], charLevel: number | null): FightRow[] {
  const ok = offense.filter((a) => usable(a, charLevel) && !NEVER_DEFAULT_FIGHTS.includes(lc(a.name)));
  const casts = ok.filter((a) => a.type !== 'skill').sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  // a skill that is offensive by group but not in the known list ranks after the known ones
  const rank = (a: AutoPilotAbility) => {
    const i = COMBAT_SKILL_NAMES.indexOf(lc(a.name));
    return i < 0 ? COMBAT_SKILL_NAMES.length : i;
  };
  const skills = ok.filter((a) => a.type === 'skill').sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  // up to two casts, so a hybrid keeps room for a skill; a class with no skills fills all its rows from the casts
  const picked: AutoPilotAbility[] = casts.slice(0, skills.length > 0 ? DEFAULT_FIGHT_ROWS - 1 : DEFAULT_FIGHT_ROWS);
  for (const a of skills) if (picked.length < DEFAULT_FIGHT_ROWS) picked.push(a);

  const seen = new Set<string>();
  const rows: FightRow[] = [];
  for (const a of picked) {
    const cmd = fightCommandFor(a);
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    // the reuse time starts at the ability's measured lag (unknown: 0); the caller replaces it with a cooldown the engine already learned for that command
    rows.push({ cmd, cooldownSec: cooldownSecFromLag(a.lagMs) });
  }
  return rows;
}
