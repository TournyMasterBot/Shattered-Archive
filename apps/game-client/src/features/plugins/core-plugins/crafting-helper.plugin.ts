// apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts
import type { IPluginModule, PluginRuntimeApi, HudSlotId, HudWidgetContent } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';
import { getTrackedSkillLevel, setTrackedSkillLevel, getOrderQueue, addOrder, removeOrder, updateOrder, type StoredCraftOrder } from './crafting-helper-storage';

/**
 * Crafting Helper — automates tier-3 crafting skill-up training.
 *
 * Config-driven across craft skills (verb, score-rank keyword, and tier
 * table are all data, not code) — ships seeded with Spellcrafting, Sharp
 * Weapons, Blunt Weapons, and Armor Crafting tier tables. A character
 * trains one craft skill at a time via `activeCraftType`.
 *
 * Aliases (type in the command bar) — prefixed with "crafthelper", not
 * "craft", so they never compete with the game's own `craft` command:
 *   crafthelper start   — begin the pull/craft/store loop for the active craft type
 *   crafthelper stop    — finish the current step, then go idle
 *   crafthelper status  — print current state/skill/session stats
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface CraftTypeRow {
  id: string;
  label: string;
  verb: string;
  keyword: string;
}

export interface RecipeComponent {
  material: string;
  qty: number;
}

export interface CraftTierRow {
  craftTypeId: string;
  skillThreshold: number;
  trinket: string;
  components: RecipeComponent[];
}

export type EngineState =
  | 'idle'
  | 'awaiting_score'
  | 'pulling_components'
  | 'crafting'
  | 'storing_trinket'
  | 'checking_quality'
  | 'error_stopped';

export type CraftOutcome = 'success' | 'failed_destroyed' | 'failed_no_loss' | null;

export interface SessionStats {
  startedAt: number;
  craftAttempts: number;
  successes: number;
  failedDestroyed: number;
  failedNoLoss: number;
  skillGains: number;
}

// ── Config parsing ────────────────────────────────────────────────────

export const DEFAULT_CRAFT_TYPES_CONFIG = [
  '# <id> | <label> | <command verb> | <score rank keyword>',
  'spellcrafting  | Spellcrafting  | spellcraft  | Spellcrafter',
  'sharp-weapons  | Sharp Weapons  | sharpweapon | Weaponsmith (Sharp)',
  'blunt-weapons  | Blunt Weapons  | bluntweapon | Weaponsmith (Blunt)',
  'armor-crafting | Armor Crafting | armorcraft  | Armorcrafter',
  'tailoring      | Tailoring      | tailor      | Tailor',
].join('\n');

// Sharp/Blunt Weapons and Armor Crafting all share the same 9 materials,
// 3 variants each (highest-to-lowest skill within a material), and the same
// descending threshold ladder (962 down to 1, step 37) — verified against a
// full in-game craft list per skill, not guessed. Every component is qty 2.
const SHARED_TIER_MATERIALS: Array<{ threshold: number; material: string; components: string }> = [
  { threshold: 962, material: 'netherium', components: 'netherium bar:2, ironwood board:2, elephant leather square:2' },
  { threshold: 925, material: 'netherium', components: 'netherium bar:2, ironwood board:2, elephant leather square:2' },
  { threshold: 888, material: 'netherium', components: 'netherium bar:2, ironwood board:2, elephant leather square:2' },
  { threshold: 851, material: 'asterite', components: 'asterite bar:2, stonewood board:2, shark leather square:2' },
  { threshold: 814, material: 'asterite', components: 'asterite bar:2, stonewood board:2, shark leather square:2' },
  { threshold: 777, material: 'asterite', components: 'asterite bar:2, stonewood board:2, shark leather square:2' },
  { threshold: 740, material: 'adamantium', components: 'adamantium bar:2, hickory board:2, whale leather square:2' },
  { threshold: 703, material: 'adamantium', components: 'adamantium bar:2, hickory board:2, whale leather square:2' },
  { threshold: 666, material: 'adamantium', components: 'adamantium bar:2, hickory board:2, whale leather square:2' },
  { threshold: 629, material: 'mithril', components: 'mithril bar:2, maple board:2, bear leather square:2' },
  { threshold: 592, material: 'mithril', components: 'mithril bar:2, maple board:2, bear leather square:2' },
  { threshold: 555, material: 'mithril', components: 'mithril bar:2, maple board:2, bear leather square:2' },
  { threshold: 518, material: 'fine alloy', components: 'fine alloy bar:2, oak board:2, bull moose leather square:2' },
  { threshold: 481, material: 'fine alloy', components: 'fine alloy bar:2, oak board:2, bull moose leather square:2' },
  { threshold: 444, material: 'fine alloy', components: 'fine alloy bar:2, oak board:2, bull moose leather square:2' },
  { threshold: 407, material: 'alloy', components: 'alloy bar:2, elm board:2, moose leather square:2' },
  { threshold: 370, material: 'alloy', components: 'alloy bar:2, elm board:2, moose leather square:2' },
  { threshold: 333, material: 'alloy', components: 'alloy bar:2, elm board:2, moose leather square:2' },
  { threshold: 296, material: 'steel', components: 'steel bar:2, pine board:2, bull leather square:2' },
  { threshold: 259, material: 'steel', components: 'steel bar:2, pine board:2, bull leather square:2' },
  { threshold: 222, material: 'steel', components: 'steel bar:2, pine board:2, bull leather square:2' },
  { threshold: 185, material: 'iron', components: 'iron bar:2, fir board:2, cow leather square:2' },
  { threshold: 148, material: 'iron', components: 'iron bar:2, fir board:2, cow leather square:2' },
  { threshold: 111, material: 'iron', components: 'iron bar:2, fir board:2, cow leather square:2' },
  { threshold: 74, material: 'bronze', components: 'bronze bar:2, cedar board:2, deer leather square:2' },
  { threshold: 37, material: 'bronze', components: 'bronze bar:2, cedar board:2, deer leather square:2' },
  { threshold: 1, material: 'bronze', components: 'bronze bar:2, cedar board:2, deer leather square:2' },
];

const BLUNT_VARIANTS = ['spiked', 'studded', 'round'];
const SHARP_VARIANTS = ['sharp', 'dull', 'long'];
const ARMOR_VARIANTS = ['plate', 'chain', 'studs'];

// Weapon trinkets name as "<variant> <material> trinket" (e.g. "spiked
// netherium trinket"); armor trinkets reverse that to "<material> <variant>
// trinket" (e.g. "netherium plate trinket", confirmed by the "bronze studs
// trinket" example) — same materials/thresholds/components, different word
// order, so the naming is a callback rather than a baked-in assumption.
function craftTierRows(
  craftTypeId: string,
  variants: string[],
  trinketName: (variant: string, material: string) => string,
): string {
  // Each material tier has 3 rows (one per variant, in the same threshold/
  // material order as SHARED_TIER_MATERIALS) — variants[i % 3] picks the
  // right name for that row.
  return SHARED_TIER_MATERIALS.map(({ threshold, material, components }, i) => {
    const variant = variants[i % 3];
    return `${craftTypeId} | ${threshold} | ${trinketName(variant, material)} | ${components}`;
  }).join('\n');
}

// Tailoring skill-up trinkets, verified against a real in-game craft list.
// Each of the first 9 material-tier pairs (see TAILORING_TIERS below,
// index 0-8) produces two trinkets: a cloth-only "<cloth> doll trinket"
// (2 components, qty 3 each) that unlocks first, and a "<leather> leather
// saddle trinket" (3 components, qty 2 each — the same tier's cloth thread
// + cloth square, plus its own leather square) that unlocks ~55 skill
// points later. Tier index 9 (silksteel/bull elephant) is NOT included —
// the paste this was transcribed from was cut off before reaching it, and
// per this plugin's data-entry discipline that tier is left out rather
// than guessed. Real in-game item names use "spool of <material> thread",
// not "<material> thread" — this also corrected the order-item recipes
// below, which had guessed the shorter form before this list existed.
const TAILORING_TRINKET_TIERS: Array<{ dollThreshold: number; saddleThreshold: number; cloth: string; leather: string }> = [
  { dollThreshold: 1, saddleThreshold: 56, cloth: 'woolen', leather: 'deer' },
  { dollThreshold: 111, saddleThreshold: 166, cloth: 'linen', leather: 'cow' },
  { dollThreshold: 222, saddleThreshold: 277, cloth: 'brocade', leather: 'bull' },
  { dollThreshold: 333, saddleThreshold: 388, cloth: 'silk', leather: 'moose' },
  { dollThreshold: 444, saddleThreshold: 499, cloth: 'gossamer', leather: 'bull moose' },
  { dollThreshold: 555, saddleThreshold: 610, cloth: 'sylvan', leather: 'bear' },
  { dollThreshold: 666, saddleThreshold: 721, cloth: 'seamist', leather: 'whale' },
  { dollThreshold: 777, saddleThreshold: 832, cloth: 'nightshade', leather: 'shark' },
  { dollThreshold: 888, saddleThreshold: 943, cloth: 'wyvernskin', leather: 'elephant' },
];

function tailoringTierRows(): string {
  const rows: string[] = [];
  for (const { dollThreshold, saddleThreshold, cloth, leather } of TAILORING_TRINKET_TIERS) {
    rows.push(`tailoring | ${dollThreshold} | ${cloth} doll trinket | ${cloth} cloth square:3, spool of ${cloth} thread:3`);
    rows.push(
      `tailoring | ${saddleThreshold} | ${leather} leather saddle trinket | ${cloth} cloth square:2, spool of ${cloth} thread:2, ${leather} leather square:2`,
    );
  }
  return rows.join('\n');
}

export const DEFAULT_TIER_TABLE_CONFIG = [
  '# <craftTypeId> | <skill threshold> | <trinket> | <components as name:qty, name:qty, ...>',
  'spellcrafting | 1   | obsidian gemstone | uncut obsidian stone:1',
  'spellcrafting | 121 | moonstone         | uncut moonstone:1',
  'spellcrafting | 241 | opal gemstone     | uncut opal stone:1',
  'spellcrafting | 361 | amethyst gemstone | uncut amethyst stone:1',
  'spellcrafting | 481 | emerald gemstone  | uncut emerald stone:1',
  'spellcrafting | 601 | sapphire gemstone | uncut sapphire stone:1',
  'spellcrafting | 721 | ruby gemstone     | uncut ruby stone:1',
  'spellcrafting | 841 | diamond gemstone  | uncut diamond stone:1',
  craftTierRows('sharp-weapons', SHARP_VARIANTS, (v, m) => `${v} ${m} trinket`),
  craftTierRows('blunt-weapons', BLUNT_VARIANTS, (v, m) => `${v} ${m} trinket`),
  craftTierRows('armor-crafting', ARMOR_VARIANTS, (v, m) => `${m} ${v} trinket`),
  tailoringTierRows(),
].join('\n');

function splitConfigLines(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/**
 * Parses "name:qty, name:qty, ..." into components; skips malformed pieces.
 * A piece with no ":qty" is accepted as backward-compat with the pre-multi-
 * component tier-table format (bare material name, implicit qty 1) — older
 * saved configs still contain rows in that shape, and silently dropping
 * them here emptied every tier's component list (live bug: "Skill level
 * 948 has no matching tier" for every level, not just an edge case).
 */
function parseComponentList(raw: string): RecipeComponent[] {
  const components: RecipeComponent[] = [];
  for (const piece of raw.split(',')) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const idx = trimmed.lastIndexOf(':');
    if (idx === -1) {
      components.push({ material: trimmed, qty: 1 });
      continue;
    }
    const material = trimmed.slice(0, idx).trim();
    const qty = parseInt(trimmed.slice(idx + 1).trim(), 10);
    if (!material || !Number.isFinite(qty) || qty <= 0) continue;
    components.push({ material, qty });
  }
  return components;
}

export function parseCraftTypesConfig(raw: unknown): CraftTypeRow[] {
  const rows: CraftTypeRow[] = [];
  for (const line of splitConfigLines(raw)) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 4) continue;
    const [id, label, verb, keyword] = parts;
    if (!id || !label || !verb || !keyword) continue;
    rows.push({ id: id.toLowerCase(), label, verb, keyword });
  }
  return rows;
}

export function parseTierTableConfig(raw: unknown): CraftTierRow[] {
  const rows: CraftTierRow[] = [];
  for (const line of splitConfigLines(raw)) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 4) continue;
    const [craftTypeId, thresholdStr, trinket, componentsStr] = parts;
    const skillThreshold = parseInt(thresholdStr, 10);
    if (!craftTypeId || !trinket || !componentsStr || !Number.isFinite(skillThreshold)) continue;
    const components = parseComponentList(componentsStr);
    if (components.length === 0) continue;
    rows.push({ craftTypeId: craftTypeId.toLowerCase(), skillThreshold, trinket, components });
  }
  return rows;
}

/** Highest tier a craft type's rows offer at or below the given skill level. */
export function tierForSkill(craftTypeId: string, skillLevel: number, rows: CraftTierRow[]): CraftTierRow | null {
  let best: CraftTierRow | null = null;
  for (const row of rows) {
    if (row.craftTypeId !== craftTypeId) continue;
    if (row.skillThreshold > skillLevel) continue;
    if (!best || row.skillThreshold > best.skillThreshold) best = row;
  }
  return best;
}

export interface ResolvedRecipe {
  outputName: string;
  components: RecipeComponent[];
}

function tierRowToRecipe(row: CraftTierRow): ResolvedRecipe {
  return { outputName: row.trinket, components: row.components };
}

// ── Order mode: recipes, quality parsing/routing ─────────────────────────

export interface OrderItemRecipe {
  craftTypeId: string;
  components: RecipeComponent[];
}

// Every arcanium armor piece uses the same 2 components (arcanium bar +
// bull elephant leather square) at the same quantity, driven by slot —
// helmet/boots/gloves:1, leggings/pants/sleeves:2, tunic:4 — confirmed
// identical across Chainmail and Studded Leather; Platemail's helmet is
// confirmed and the rest of its slots are inferred from that pattern
// (not yet independently confirmed in-game).
function arcaniumArmorSet(setName: string, slotQty: Record<string, number>): Record<string, OrderItemRecipe> {
  const recipes: Record<string, OrderItemRecipe> = {};
  for (const [slot, qty] of Object.entries(slotQty)) {
    recipes[`arcanium ${setName} ${slot}`] = {
      craftTypeId: 'armor-crafting',
      components: [
        { material: 'arcanium bar', qty },
        { material: 'bull elephant leather square', qty },
      ],
    };
  }
  return recipes;
}

// Tailoring order items: 10 tiers, each pairing a cloth material with the
// leather material of the same tier, 2 armor types per tier (cloth and
// leather), 6 slots each. Confirmed by the user: a cloth item is named
// "<material> <slot>" and needs "spool of <material> thread" + "<material>
// cloth square"; a leather item is named "<leather material> leather
// <slot>" and needs the *same-tier cloth material's* thread + "<leather
// material> leather square" (e.g. "whale leather sleeves" needs 2 spools
// of seamist thread + 2 whale leather squares) — the "spool of" thread
// naming and tier 0's "woolen" (not "wool") material name were both
// corrected against a real in-game craft list (see TAILORING_TRINKET_TIERS
// above); the original casual description had guessed shorter forms.
// Slot quantities: helmet/gloves/boots:1, sleeves/leggings:2, shirt:4 —
// same per-slot pattern as armor crafting.
const TAILORING_SLOT_QTY: Record<string, number> = {
  helmet: 1,
  gloves: 1,
  boots: 1,
  sleeves: 2,
  leggings: 2,
  shirt: 4,
};

const TAILORING_TIERS: Array<{ cloth: string; leather: string }> = [
  { cloth: 'woolen', leather: 'deer' },
  { cloth: 'linen', leather: 'cow' },
  { cloth: 'brocade', leather: 'bull' },
  { cloth: 'silk', leather: 'moose' },
  { cloth: 'gossamer', leather: 'bull moose' },
  { cloth: 'sylvan', leather: 'bear' },
  { cloth: 'seamist', leather: 'whale' },
  { cloth: 'nightshade', leather: 'shark' },
  { cloth: 'wyvernskin', leather: 'elephant' },
  { cloth: 'silksteel', leather: 'bull elephant' },
];

function clothArmorSet(material: string): Record<string, OrderItemRecipe> {
  const recipes: Record<string, OrderItemRecipe> = {};
  for (const [slot, qty] of Object.entries(TAILORING_SLOT_QTY)) {
    recipes[`${material} ${slot}`] = {
      craftTypeId: 'tailoring',
      components: [
        { material: `spool of ${material} thread`, qty },
        { material: `${material} cloth square`, qty },
      ],
    };
  }
  return recipes;
}

function leatherArmorSet(clothMaterial: string, leatherMaterial: string): Record<string, OrderItemRecipe> {
  const recipes: Record<string, OrderItemRecipe> = {};
  for (const [slot, qty] of Object.entries(TAILORING_SLOT_QTY)) {
    recipes[`${leatherMaterial} leather ${slot}`] = {
      craftTypeId: 'tailoring',
      components: [
        { material: `spool of ${clothMaterial} thread`, qty },
        { material: `${leatherMaterial} leather square`, qty },
      ],
    };
  }
  return recipes;
}

function tailoringSets(): Record<string, OrderItemRecipe> {
  let recipes: Record<string, OrderItemRecipe> = {};
  for (const { cloth, leather } of TAILORING_TIERS) {
    recipes = { ...recipes, ...clothArmorSet(cloth), ...leatherArmorSet(cloth, leather) };
  }
  return recipes;
}

// Hardcoded, not config — this data rarely changes and the user does not
// want to maintain an override surface for it. Add new order items here.
export const ORDER_ITEM_RECIPES: Record<string, OrderItemRecipe> = {
  'diamond of pain': {
    craftTypeId: 'spellcrafting',
    components: [
      { material: 'diamond gemstone', qty: 1 },
      { material: 'pain essence', qty: 1 },
    ],
  },
  ...tailoringSets(),
  ...arcaniumArmorSet('platemail', { helmet: 1, boots: 1, leggings: 2, gloves: 1, sleeves: 2, tunic: 4 }),
  ...arcaniumArmorSet('chainmail', { boots: 1, leggings: 2, gloves: 1, sleeves: 2, tunic: 4, helmet: 1 }),
  ...arcaniumArmorSet('studded leather', { boots: 1, pants: 2, gloves: 1, sleeves: 2, tunic: 4, helmet: 1 }),
};

export type QualitySpec =
  | { kind: 'atLeast'; min: number }
  | { kind: 'exact'; value: number }
  | { kind: 'range'; min: number; max: number };

export function parseQualitySpec(raw: string): QualitySpec | null {
  const trimmed = raw.trim();

  const atLeast = trimmed.match(/^(\d+)\+$/);
  if (atLeast) return { kind: 'atLeast', min: parseInt(atLeast[1], 10) };

  const range = trimmed.match(/^(\d+)-(\d+)$/);
  if (range) {
    const min = parseInt(range[1], 10);
    const max = parseInt(range[2], 10);
    return min <= max ? { kind: 'range', min, max } : null;
  }

  const exact = trimmed.match(/^(\d+)$/);
  if (exact) return { kind: 'exact', value: parseInt(exact[1], 10) };

  return null;
}

export function qualityMatchesSpec(quality: number, spec: QualitySpec): boolean {
  if (spec.kind === 'atLeast') return quality >= spec.min;
  if (spec.kind === 'exact') return quality === spec.value;
  return quality >= spec.min && quality <= spec.max;
}

export interface QualityContainerRow {
  min: number;
  max: number;
  container: string;
}

export function parseQualityContainerMap(raw: unknown): QualityContainerRow[] {
  const rows: QualityContainerRow[] = [];
  for (const line of splitConfigLines(raw)) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;
    const [rangeStr, container] = parts;
    if (!container) continue;

    const range = rangeStr.match(/^(\d+)-(\d+)$/);
    if (range) {
      rows.push({ min: parseInt(range[1], 10), max: parseInt(range[2], 10), container });
      continue;
    }
    const single = rangeStr.match(/^(\d+)$/);
    if (single) {
      const v = parseInt(single[1], 10);
      rows.push({ min: v, max: v, container });
    }
  }
  return rows;
}

export function containerForQuality(quality: number, rows: QualityContainerRow[]): string {
  for (const row of rows) {
    if (quality >= row.min && quality <= row.max) return row.container;
  }
  return 'vault';
}

// ── Line matchers (applied per-line, after stripAnsi + split('\n') + trim —
// sidesteps the `$`-anchor/trailing-\n gotcha entirely) ───────────────────

const SCORE_LINE_RE = /^Craftskill:\s*(\d+)\s+Craft Rank:\s*(.+)$/i;

export function findCraftSkillLevel(strippedText: string, keyword: string): number | null {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return null;
  for (const rawLine of strippedText.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(SCORE_LINE_RE);
    if (m && m[2].trim().toLowerCase().includes(kw)) {
      return parseInt(m[1], 10);
    }
  }
  return null;
}

const OUTCOME_SUCCESS = 'You were successful.';
const OUTCOME_DESTROYED = 'You failed and destroyed some materials in the process.';
const OUTCOME_NO_LOSS = 'You failed but did not lose any materials.';
const VAULT_FAILURE_TEXT = 'I see nothing like that in the vault.';
const CRAFT_INTERRUPTED_TEXT = 'You stop crafting.';
const SKILL_IMPROVED_RE = /Your crafting skill has improved\.\s*\((\d+)\)/;

export function matchCraftOutcome(line: string): CraftOutcome {
  if (line.includes(OUTCOME_SUCCESS)) return 'success';
  if (line.includes(OUTCOME_DESTROYED)) return 'failed_destroyed';
  if (line.includes(OUTCOME_NO_LOSS)) return 'failed_no_loss';
  return null;
}

export function matchSkillImproved(line: string): number | null {
  const m = line.match(SKILL_IMPROVED_RE);
  return m ? parseInt(m[1], 10) : null;
}

export function matchVaultFailure(line: string): boolean {
  return line.includes(VAULT_FAILURE_TEXT);
}

export function matchCraftInterrupted(line: string): boolean {
  return line.includes(CRAFT_INTERRUPTED_TEXT);
}

const CONDITION_RE = /Condition:\s*[^(]+\(\s*(\d+)%\s*\)/;

export function matchItemCondition(line: string): number | null {
  const m = line.match(CONDITION_RE);
  return m ? parseInt(m[1], 10) : null;
}

// ── HUD content ───────────────────────────────────────────────────────

function phaseLabel(state: EngineState): string {
  switch (state) {
    case 'awaiting_score':
      return 'checking score';
    case 'pulling_components':
      return 'pulling components';
    case 'crafting':
      return 'crafting';
    case 'storing_trinket':
      return 'storing trinket';
    case 'checking_quality':
      return 'checking quality';
    default:
      return state;
  }
}

export function buildHudContent(input: {
  state: EngineState;
  everRun: boolean;
  trackedSkillLevel: number | null;
  activeItemName: string | null;
  stopReason: string | null;
}): HudWidgetContent | null {
  const { state, everRun, trackedSkillLevel, activeItemName, stopReason } = input;

  // Never started: don't occupy a slot for a plugin that hasn't run yet.
  if (!everRun && state === 'idle') return null;

  if (state === 'error_stopped') {
    return { label: 'Crafting Helper', value: `Stopped: ${stopReason ?? 'error'}`, variant: 'critical' };
  }

  if (state === 'idle') {
    return { label: 'Crafting Helper', value: 'Stopped', variant: 'default' };
  }

  return {
    label: 'Crafting Helper',
    value: `Lv ${trackedSkillLevel ?? '?'} · ${activeItemName ?? '?'} · ${phaseLabel(state)}`,
    variant: 'default',
  };
}

// ── Config reading ────────────────────────────────────────────────────

interface EngineConfig {
  craftTypes: CraftTypeRow[];
  tierTable: CraftTierRow[];
  activeCraftType: string;
  commandPacingDelayMs: number;
  pullConfirmTimeoutMs: number;
  scoreResponseTimeoutMs: number;
  loreResponseTimeoutMs: number;
  orderHoldingContainer: string;
  qualityContainerMap: QualityContainerRow[];
  debug: boolean;
  hudSlot: HudSlotId | 'none';
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readConfig(api: PluginRuntimeApi): EngineConfig {
  const cfg = api.getConfig();
  const hudSlot = cfg.hudSlot;
  return {
    craftTypes: parseCraftTypesConfig(cfg.craftTypes),
    tierTable: parseTierTableConfig(cfg.tierTable),
    activeCraftType:
      typeof cfg.activeCraftType === 'string' && cfg.activeCraftType.trim()
        ? cfg.activeCraftType.trim().toLowerCase()
        : 'spellcrafting',
    commandPacingDelayMs: numOr(cfg.commandPacingDelayMs, 150),
    pullConfirmTimeoutMs: numOr(cfg.pullConfirmTimeoutMs, 200),
    scoreResponseTimeoutMs: numOr(cfg.scoreResponseTimeoutMs, 1000),
    loreResponseTimeoutMs: numOr(cfg.loreResponseTimeoutMs, 2000),
    orderHoldingContainer:
      typeof cfg.orderHoldingContainer === 'string' && cfg.orderHoldingContainer.trim()
        ? cfg.orderHoldingContainer.trim()
        : 'orders',
    qualityContainerMap: parseQualityContainerMap(cfg.qualityContainerMap),
    debug: cfg.debug === true,
    hudSlot: hudSlot === 'hud.bottomStrip' || hudSlot === 'hud.rightColumn' || hudSlot === 'none'
      ? hudSlot
      : 'hud.bottomStrip',
  };
}

function characterKey(): string {
  const w = window as unknown as { __SA_IDENTITY__?: { characterName?: string } };
  const name = w?.__SA_IDENTITY__?.characterName;
  return typeof name === 'string' && name.trim() ? name.trim().toLowerCase() : '__unknown__';
}

// ── Plugin ────────────────────────────────────────────────────────────

export function createCraftingHelperPlugin(): IPluginModule {
  let state: EngineState = 'idle';
  let everRun = false;
  let stopRequested = false;
  let stopReason: string | null = null;
  let trackedSkillLevel: number | null = null;
  let activeCraftTypeRow: CraftTypeRow | null = null;
  let activeRecipe: ResolvedRecipe | null = null;
  let pullIndex = 0;
  type EngineMode = 'improve' | 'order';
  let mode: EngineMode = 'improve';
  let activeOrder: StoredCraftOrder | null = null;
  let activeOrderRemoved = false;
  let orderSession: { inSpecRouted: number; offSpecRouted: number } | null = null;
  let qualityTimer: ReturnType<typeof setTimeout> | null = null;
  let session: SessionStats | null = null;

  let scoreTimer: ReturnType<typeof setTimeout> | null = null;
  let pullTimer: ReturnType<typeof setTimeout> | null = null;
  let pacingTimer: ReturnType<typeof setTimeout> | null = null;
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;
  // Components pulled from the vault that a craft hasn't consumed yet — if
  // the run stops, these go back into the vault.
  let materialsHeld: RecipeComponent[] | null = null;
  let lastPublishedSlot: HudSlotId | null = null;

  function clearAllTimers() {
    if (scoreTimer) clearTimeout(scoreTimer);
    if (pullTimer) clearTimeout(pullTimer);
    if (pacingTimer) clearTimeout(pacingTimer);
    if (qualityTimer) clearTimeout(qualityTimer);
    if (releaseTimer) clearTimeout(releaseTimer);
    scoreTimer = pullTimer = pacingTimer = qualityTimer = releaseTimer = null;
  }

  function publishHud(api: PluginRuntimeApi, cfg: EngineConfig) {
    if (!api.setHudWidget) return;
    const targetSlot: HudSlotId | null = cfg.hudSlot === 'none' ? null : cfg.hudSlot;

    if (lastPublishedSlot && lastPublishedSlot !== targetSlot) {
      api.setHudWidget(lastPublishedSlot, null);
      lastPublishedSlot = null;
    }
    if (!targetSlot) return;

    const content = buildHudContent({
      state,
      everRun,
      trackedSkillLevel,
      activeItemName: activeRecipe?.outputName ?? null,
      stopReason,
    });

    api.setHudWidget(targetSlot, content);
    lastPublishedSlot = content ? targetSlot : null;
  }

  function writeInfo(api: PluginRuntimeApi, msg: string) {
    api.writeTerminal(`{G[Crafting Helper] ${msg}{x\n`);
  }

  function writeError(api: PluginRuntimeApi, msg: string) {
    api.writeTerminal(`{R[Crafting Helper] ${msg}{x\n`);
  }

  // ── resolveNextRecipe — improve-mode / order-mode seam ──────────────
  function resolveNextRecipe(cfg: EngineConfig): ResolvedRecipe | null {
    if (mode === 'order') {
      if (!activeOrder) return null;
      const orderRecipe = ORDER_ITEM_RECIPES[activeOrder.itemName];
      return orderRecipe ? { outputName: activeOrder.itemName, components: orderRecipe.components } : null;
    }
    if (trackedSkillLevel == null) return null;
    const row = tierForSkill(cfg.activeCraftType, trackedSkillLevel, cfg.tierTable);
    return row ? tierRowToRecipe(row) : null;
  }

  // ── handleCraftSuccess — improve-mode / order-mode seam ──────────────
  function handleCraftSuccess(api: PluginRuntimeApi, cfg: EngineConfig, recipe: ResolvedRecipe) {
    if (mode === 'improve') {
      api.sendCommand(`put 1 '${recipe.outputName}' vault`);
      pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
      return;
    }
    state = 'checking_quality';
    publishHud(api, cfg);
    api.sendCommand(`lore '${recipe.outputName}'`);
    qualityTimer = setTimeout(() => onQualityTimeout(api), cfg.loreResponseTimeoutMs);
  }

  function onQualityTimeout(api: PluginRuntimeApi) {
    qualityTimer = null;
    const cfg = readConfig(api);
    enterError(
      api,
      cfg,
      `Couldn't verify quality of "${activeRecipe?.outputName}" within ${cfg.loreResponseTimeoutMs}ms — stopped rather than guess where to route it.`,
    );
  }

  function resolveOrderQuality(api: PluginRuntimeApi, cfg: EngineConfig, quality: number) {
    if (!activeRecipe) {
      enterError(api, cfg, 'Internal error: no active recipe.');
      return;
    }
    const outputName = activeRecipe.outputName;
    const order = activeOrderRemoved ? null : activeOrder;
    const inSpec = order != null && qualityMatchesSpec(quality, order.qualitySpec);

    if (inSpec && order) {
      if (orderSession) orderSession.inSpecRouted += 1;
      api.sendCommand(`put 1 '${outputName}' ${cfg.orderHoldingContainer}`);
      const remaining = order.quantityRemaining - 1;
      if (remaining <= 0) {
        removeOrder(characterKey(), order.id);
        activeOrder = null;
        pacingTimer = setTimeout(() => advanceOrderQueue(api), cfg.commandPacingDelayMs);
      } else {
        updateOrder(characterKey(), order.id, { quantityRemaining: remaining });
        activeOrder = { ...order, quantityRemaining: remaining };
        pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
      }
    } else {
      if (orderSession) orderSession.offSpecRouted += 1;
      const container = containerForQuality(quality, cfg.qualityContainerMap);
      api.sendCommand(`put 1 '${outputName}' ${container}`);
      if (activeOrderRemoved) {
        activeOrderRemoved = false;
        pacingTimer = setTimeout(() => advanceOrderQueue(api), cfg.commandPacingDelayMs);
      } else {
        pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
      }
    }
  }

  function advanceOrderQueue(api: PluginRuntimeApi) {
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    const queue = getOrderQueue(characterKey());
    if (queue.length === 0) {
      mode = 'improve';
      goIdle(api, cfg);
      return;
    }
    const next = queue[0];
    const orderRecipe = ORDER_ITEM_RECIPES[next.itemName];
    if (!orderRecipe) {
      enterError(api, cfg, `Order item "${next.itemName}" has no known recipe.`);
      return;
    }
    const typeRow = cfg.craftTypes.find((t) => t.id === orderRecipe.craftTypeId);
    if (!typeRow) {
      enterError(api, cfg, `Unknown craft type "${orderRecipe.craftTypeId}" for order item "${next.itemName}".`);
      return;
    }
    activeOrder = next;
    activeOrderRemoved = false;
    activeCraftTypeRow = typeRow;
    beginPullCycle(api);
  }

  // Best-effort: a `put` for something not actually held is assumed to
  // no-op harmlessly (same assumption as the destroyed-outcome put-back).
  function releaseMaterials(api: PluginRuntimeApi, cfg: EngineConfig) {
    const held = materialsHeld;
    materialsHeld = null;
    if (!held || held.length === 0) return;
    writeInfo(api, 'Returning pulled materials to the vault.');
    const step = (i: number) => {
      if (i >= held.length) {
        releaseTimer = null;
        return;
      }
      releaseTimer = setTimeout(() => {
        api.sendCommand(`put ${held[i].qty} '${held[i].material}' vault`);
        step(i + 1);
      }, cfg.commandPacingDelayMs);
    };
    step(0);
  }

  function goIdle(api: PluginRuntimeApi, cfg: EngineConfig) {
    stopRequested = false;
    state = 'idle';
    activeRecipe = null;
    publishHud(api, cfg);
    writeInfo(api, 'Stopped.');
    releaseMaterials(api, cfg);
  }

  function enterError(api: PluginRuntimeApi, cfg: EngineConfig, reason: string) {
    clearAllTimers();
    state = 'error_stopped';
    stopReason = reason;
    publishHud(api, cfg);
    writeError(api, reason);
    releaseMaterials(api, cfg);
  }

  function beginPullCycle(api: PluginRuntimeApi) {
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    if (mode === 'order' && activeOrderRemoved) {
      activeOrderRemoved = false;
      advanceOrderQueue(api);
      return;
    }

    const recipe = resolveNextRecipe(cfg);
    if (!recipe) {
      enterError(api, cfg, `Skill level ${trackedSkillLevel} has no matching tier in the tier table.`);
      return;
    }

    activeRecipe = recipe;
    pullIndex = 0;
    pullComponent(api, cfg);
  }

  function pullComponent(api: PluginRuntimeApi, cfg: EngineConfig) {
    if (!activeRecipe) {
      enterError(api, cfg, 'Internal error: no active recipe.');
      return;
    }
    if (pullIndex >= activeRecipe.components.length) {
      sendCraft(api, cfg);
      return;
    }
    state = 'pulling_components';
    publishHud(api, cfg);
    materialsHeld = activeRecipe.components.slice(0, pullIndex + 1);
    const component = activeRecipe.components[pullIndex];
    api.sendCommand(`get ${component.qty} '${component.material}' vault`);
    pullTimer = setTimeout(() => onPullTimeout(api), cfg.pullConfirmTimeoutMs);
  }

  function onPullTimeout(api: PluginRuntimeApi) {
    pullTimer = null;
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    pullIndex += 1;
    pullComponent(api, cfg);
  }

  function sendCraft(api: PluginRuntimeApi, cfg: EngineConfig) {
    if (!activeCraftTypeRow || !activeRecipe) {
      enterError(api, cfg, 'Internal error: no active craft type/recipe.');
      return;
    }
    state = 'crafting';
    publishHud(api, cfg);
    api.sendCommand(`craft ${activeCraftTypeRow.verb} '${activeRecipe.outputName}'`);
    // No timeout here on purpose: higher-tier crafts can take a while to
    // resolve, and one of the three known outcome lines always eventually
    // arrives — there's no "silence means success" ambiguity like the pull
    // step has, so waiting indefinitely is correct, not a stall risk.
  }

  function beginDestroyedRecovery(api: PluginRuntimeApi, cfg: EngineConfig, components: RecipeComponent[]) {
    // The "destroyed" message is not reliable — it doesn't always mean every
    // (or any) pulled component was actually lost. Rather than guess which
    // survived, put everything back (a `put` on something not held is
    // assumed to no-op harmlessly, same assumption already made for a
    // successful craft's `put`) and re-pull the full recipe fresh.
    materialsHeld = null;
    putBackComponent(api, cfg, components, 0);
  }

  function putBackComponent(api: PluginRuntimeApi, cfg: EngineConfig, components: RecipeComponent[], index: number) {
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    if (index >= components.length) {
      pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
      return;
    }
    pacingTimer = setTimeout(() => {
      const component = components[index];
      api.sendCommand(`put ${component.qty} '${component.material}' vault`);
      putBackComponent(api, cfg, components, index + 1);
    }, cfg.commandPacingDelayMs);
  }

  function handleRawData(api: PluginRuntimeApi, rawText: string) {
    // Every line of game output flows through here — bail immediately unless
    // we're mid-cycle, so idle/stopped/storing sit at effectively zero cost.
    if (
      state !== 'awaiting_score' &&
      state !== 'pulling_components' &&
      state !== 'crafting' &&
      state !== 'storing_trinket' &&
      state !== 'checking_quality'
    ) {
      return;
    }

    const cfg = readConfig(api);
    const plain = stripAnsi(rawText).replace(/\r/g, '');

    if (state === 'awaiting_score') {
      const level = findCraftSkillLevel(plain, activeCraftTypeRow?.keyword ?? '');
      if (level != null) {
        if (scoreTimer) {
          clearTimeout(scoreTimer);
          scoreTimer = null;
        }
        trackedSkillLevel = level;
        setTrackedSkillLevel(characterKey(), cfg.activeCraftType, level);
        publishHud(api, cfg);
        beginPullCycle(api);
      }
      return;
    }

    // Skill-up notices don't always arrive bundled with the crafting outcome
    // line they follow — a live report showed one landing in a later payload
    // after `success` had already advanced state to a fresh pulling_components
    // cycle, where only vault-failure was being scanned for, so the skill-up
    // was silently dropped and the HUD stayed on the old level. Scan every
    // payload for it regardless of which mid-cycle state we're in.
    for (const rawLine of plain.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const improved = matchSkillImproved(line);
      if (improved != null) {
        trackedSkillLevel = improved;
        setTrackedSkillLevel(characterKey(), activeCraftTypeRow?.id ?? cfg.activeCraftType, improved);
        if (session) session.skillGains += 1;
        publishHud(api, cfg);
      }
    }

    // The skill-up line follows the success line, typically in the next
    // payload — by then a success has already moved state to
    // storing_trinket, so that state must be let through to the scan above.
    if (state === 'storing_trinket') return;

    if (state === 'pulling_components') {
      for (const rawLine of plain.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (matchVaultFailure(line)) {
          if (pullTimer) {
            clearTimeout(pullTimer);
            pullTimer = null;
          }
          const missing = activeRecipe?.components[pullIndex]?.material;
          materialsHeld = activeRecipe ? activeRecipe.components.slice(0, pullIndex) : null; // the failed one was never pulled
          enterError(api, cfg, `Vault is out of "${missing}" — restock needed.`);
          return;
        }
      }
      return;
    }

    if (state === 'checking_quality') {
      for (const rawLine of plain.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const quality = matchItemCondition(line);
        if (quality != null) {
          if (qualityTimer) {
            clearTimeout(qualityTimer);
            qualityTimer = null;
          }
          resolveOrderQuality(api, cfg, quality);
          return;
        }
      }
      return;
    }

    // state === 'crafting'
    let outcome: CraftOutcome = null;
    for (const rawLine of plain.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      // Something (a command, movement, being attacked) interrupted the
      // craft in progress — no outcome line will ever arrive, so stop
      // cleanly rather than wait forever or blindly re-craft.
      if (matchCraftInterrupted(line)) {
        clearAllTimers();
        writeInfo(api, 'Crafting was interrupted ("You stop crafting.") — stopping. Run `crafthelper start` to resume.');
        goIdle(api, cfg);
        return;
      }

      // A `get` that failed can be reported after pullConfirmTimeoutMs has
      // already elapsed (the pull step assumes silence means success), by
      // which point the craft command is out and we're in 'crafting'. That
      // late failure must still stop the script, not be ignored.
      if (matchVaultFailure(line)) {
        const needs = activeRecipe?.components.map((c) => `${c.material}:${c.qty}`).join(', ');
        enterError(api, cfg, `Vault ran out of components for "${activeRecipe?.outputName}" (needs ${needs}) — restock needed.`);
        return;
      }

      if (outcome === null) {
        const m = matchCraftOutcome(line);
        if (m) outcome = m;
      }
    }

    if (outcome === null) return; // keep waiting — no timeout on the craft step, see sendCraft()

    if (session) session.craftAttempts += 1;

    if (outcome === 'success') {
      if (session) session.successes += 1;
      state = 'storing_trinket';
      materialsHeld = null; // consumed by the craft
      publishHud(api, cfg);
      handleCraftSuccess(api, cfg, activeRecipe!);
    } else if (outcome === 'failed_destroyed') {
      if (session) session.failedDestroyed += 1;
      beginDestroyedRecovery(api, cfg, activeRecipe!.components);
    } else {
      if (session) session.failedNoLoss += 1;
      if (stopRequested) {
        goIdle(api, cfg);
        return;
      }
      pacingTimer = setTimeout(() => sendCraft(api, cfg), cfg.commandPacingDelayMs);
    }
  }

  function onScoreTimeout(api: PluginRuntimeApi) {
    scoreTimer = null;
    const cfg = readConfig(api);
    enterError(
      api,
      cfg,
      `Could not find a "${activeCraftTypeRow?.keyword}" line in score output within ${cfg.scoreResponseTimeoutMs}ms — is that craft trained on this character?`,
    );
  }

  function onEnable(api: PluginRuntimeApi): () => void {
    const off = api.onEvent('shatteredarchive:raw-data', (payload: unknown) => {
      const p = payload as { rawText?: string; text?: string } | string | null | undefined;
      const rawText = typeof p === 'string' ? p : String(p?.rawText ?? p?.text ?? '');
      if (!rawText) return;
      handleRawData(api, rawText);
    });

    return () => {
      off();
      clearAllTimers();
      if (lastPublishedSlot && api.setHudWidget) {
        api.setHudWidget(lastPublishedSlot, null);
        lastPublishedSlot = null;
      }
    };
  }

  function onAlias(api: PluginRuntimeApi, input: string): boolean | undefined {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    if (lower === 'crafthelper start') return handleImproveStart(api);
    if (lower === 'crafthelper stop') return handleStop(api);
    if (lower === 'crafthelper status') return handleStatus(api);

    const addMatch = trimmed.match(/^crafthelper order add\s+(\d+)\s+'([^']+)'\s+(\S+)$/i);
    if (addMatch) return handleOrderAdd(api, addMatch);
    if (lower === 'crafthelper order list') return handleOrderList(api);
    const removeMatch = trimmed.match(/^crafthelper order remove\s+(\S+)$/i);
    if (removeMatch) return handleOrderRemove(api, removeMatch[1]);
    if (lower === 'crafthelper order start') return handleOrderStart(api);
    if (lower === 'crafthelper order stop') return handleStop(api);
    if (lower === 'crafthelper order status') return handleStatus(api);

    return undefined;
  }

  function handleImproveStart(api: PluginRuntimeApi): boolean {
    const cfg = readConfig(api);
    if (releaseTimer) {
      writeInfo(api, 'Still returning materials to the vault — try again in a moment.');
      return true;
    }
    if (state !== 'idle') {
      writeInfo(api, `Already running (state: ${state}).`);
      return true;
    }

    const typeRow = cfg.craftTypes.find((t) => t.id === cfg.activeCraftType);
    if (!typeRow) {
      writeError(api, `Unknown active craft type "${cfg.activeCraftType}" — check the Craft types config.`);
      return true;
    }

    mode = 'improve';
    activeCraftTypeRow = typeRow;
    stopRequested = false;
    stopReason = null;
    everRun = true;
    session = {
      startedAt: Date.now(),
      craftAttempts: 0,
      successes: 0,
      failedDestroyed: 0,
      failedNoLoss: 0,
      skillGains: 0,
    };
    orderSession = null;

    // Best-known value until `score` confirms it — score is always sent
    // and awaited before any craft command, so this is display-only.
    trackedSkillLevel = getTrackedSkillLevel(characterKey(), cfg.activeCraftType);

    state = 'awaiting_score';
    publishHud(api, cfg);
    writeInfo(
      api,
      `Starting ${typeRow.label} training — make sure your character is parked wherever your vault and crafting station both are.`,
    );
    api.sendCommand('score');
    scoreTimer = setTimeout(() => onScoreTimeout(api), cfg.scoreResponseTimeoutMs);
    return true;
  }

  function handleOrderAdd(api: PluginRuntimeApi, match: RegExpMatchArray): boolean {
    const qty = parseInt(match[1], 10);
    const itemName = match[2].toLowerCase();
    const qualitySpec = parseQualitySpec(match[3]);

    if (!Number.isFinite(qty) || qty <= 0) {
      writeError(api, `Invalid quantity "${match[1]}".`);
      return true;
    }
    const orderRecipe = ORDER_ITEM_RECIPES[itemName];
    if (!orderRecipe) {
      writeError(api, `Unknown order item "${itemName}" — no recipe for it.`);
      return true;
    }
    if (!qualitySpec) {
      writeError(api, `Invalid quality spec "${match[3]}" — use "97+", "99", or "95-98".`);
      return true;
    }
    const cfg = readConfig(api);
    if (!cfg.craftTypes.find((t) => t.id === orderRecipe.craftTypeId)) {
      writeError(api, `Craft type "${orderRecipe.craftTypeId}" for "${itemName}" isn't configured — check the Craft types config.`);
      return true;
    }

    const order: StoredCraftOrder = {
      id: `order-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      itemName,
      quantityRemaining: qty,
      quantityTotal: qty,
      qualitySpec,
      createdAt: Date.now(),
    };
    addOrder(characterKey(), order);
    writeInfo(api, `Queued order ${order.id}: ${qty}x "${itemName}" @ ${match[3]}.`);
    return true;
  }

  function handleOrderList(api: PluginRuntimeApi): boolean {
    const queue = getOrderQueue(characterKey());
    if (queue.length === 0) {
      writeInfo(api, 'No orders queued.');
      return true;
    }
    queue.forEach((o, i) => {
      const activeTag = i === 0 && mode === 'order' && state !== 'idle' ? ' [active]' : '';
      writeInfo(api, `${o.id}: ${o.quantityRemaining}/${o.quantityTotal}x "${o.itemName}"${activeTag}`);
    });
    return true;
  }

  function handleOrderRemove(api: PluginRuntimeApi, orderId: string): boolean {
    const removed = removeOrder(characterKey(), orderId);
    if (!removed) {
      writeError(api, `No queued order with id "${orderId}".`);
      return true;
    }
    if (activeOrder?.id === orderId) {
      activeOrderRemoved = true;
    }
    writeInfo(api, `Removed order ${orderId}.`);
    return true;
  }

  function handleOrderStart(api: PluginRuntimeApi): boolean {
    if (releaseTimer) {
      writeInfo(api, 'Still returning materials to the vault — try again in a moment.');
      return true;
    }
    if (state !== 'idle') {
      writeInfo(api, `Already running (state: ${state}).`);
      return true;
    }
    const queue = getOrderQueue(characterKey());
    if (queue.length === 0) {
      writeInfo(api, 'No orders queued.');
      return true;
    }

    mode = 'order';
    stopRequested = false;
    stopReason = null;
    everRun = true;
    session = {
      startedAt: Date.now(),
      craftAttempts: 0,
      successes: 0,
      failedDestroyed: 0,
      failedNoLoss: 0,
      skillGains: 0,
    };
    orderSession = { inSpecRouted: 0, offSpecRouted: 0 };

    writeInfo(
      api,
      'Starting order fulfillment — make sure your character is parked wherever your vault and crafting station both are.',
    );
    advanceOrderQueue(api);
    return true;
  }

  function handleStop(api: PluginRuntimeApi): boolean {
    if (state === 'idle') {
      writeInfo(api, 'Not running.');
      return true;
    }
    if (state === 'error_stopped') {
      goIdle(api, readConfig(api));
      return true;
    }
    stopRequested = true;
    writeInfo(api, 'Stop requested — finishing current step, then going idle.');
    return true;
  }

  function handleStatus(api: PluginRuntimeApi): boolean {
    const cfg = readConfig(api);
    const parts = [`state=${state}`, `mode=${mode}`];

    if (mode === 'order') {
      parts.push(
        `activeOrder=${activeOrder ? `${activeOrder.quantityRemaining}/${activeOrder.quantityTotal}x "${activeOrder.itemName}"` : 'none'}`,
        `queueDepth=${getOrderQueue(characterKey()).length}`,
      );
    } else {
      parts.push(`craftType=${activeCraftTypeRow?.label ?? cfg.activeCraftType}`, `skill=${trackedSkillLevel ?? '?'}`);
    }
    parts.push(`item=${activeRecipe?.outputName ?? '?'}`);

    if (session) {
      parts.push(
        `attempts=${session.craftAttempts}`,
        `success=${session.successes}`,
        `destroyed=${session.failedDestroyed}`,
        `noLoss=${session.failedNoLoss}`,
        `skillGains=${session.skillGains}`,
      );
    }
    if (orderSession) {
      parts.push(`inSpec=${orderSession.inSpecRouted}`, `offSpec=${orderSession.offSpecRouted}`);
    }
    if (state === 'error_stopped' && stopReason) parts.push(`reason=${stopReason}`);
    writeInfo(api, parts.join('  '));
    return true;
  }

  return {
    manifest: {
      id: 'crafting-helper',
      name: 'Crafting Helper',
      version: '0.8.0',
      description:
        "Automates tier-3 crafting: skill-up training (pulls every named component, crafts the highest tier your skill qualifies for, stores finished trinkets) and order fulfillment (crafts multi-component items toward queued orders, checking quality via `lore` and routing by spec). Ships seeded with Spellcrafting, Sharp Weapons, Blunt Weapons, Armor Crafting, and Tailoring tier tables, plus real Tailoring, Armor Crafting, and Spellcrafting order recipes. Tailoring's tier table caps at 943 skill (elephant leather saddle trinket) — its top tier (silksteel/bull elephant) is missing from the source craft list. The `lore` quality-line pattern is unverified against a real log capture — watch for a stall on first live use. Run this while standing wherever your vault and crafting station both are. Commands: crafthelper start/stop/status, crafthelper order add/list/remove/start/stop/status.",
    },

    configSchema: {
      defaults: {
        craftTypes: DEFAULT_CRAFT_TYPES_CONFIG,
        tierTable: DEFAULT_TIER_TABLE_CONFIG,
        activeCraftType: 'spellcrafting',
        commandPacingDelayMs: 150,
        pullConfirmTimeoutMs: 200,
        scoreResponseTimeoutMs: 1000,
        loreResponseTimeoutMs: 2000,
        orderHoldingContainer: 'orders',
        qualityContainerMap: '',
        debug: false,
        hudSlot: 'hud.bottomStrip',
      },
      fields: [
        {
          key: 'craftTypes',
          type: 'textarea',
          label: 'Craft types',
          description:
            'One row per craft skill: "<id> | <label> | <command verb> | <score rank keyword>". Lines starting with # are comments.',
          placeholder: 'spellcrafting | Spellcrafting | spellcraft | Spellcrafter',
        },
        {
          key: 'tierTable',
          type: 'textarea',
          label: 'Tier table',
          description:
            'One row per trinket: "<craftTypeId> | <skill threshold> | <trinket name> | <components as name:qty, name:qty, ...>". The highest tier you currently qualify for is always used.',
          placeholder: 'spellcrafting | 1 | obsidian gemstone | uncut obsidian stone:1',
        },
        {
          key: 'activeCraftType',
          type: 'string',
          label: 'Active craft type',
          description: 'Which "Craft types" row id is currently being trained.',
          placeholder: 'spellcrafting',
        },
        {
          key: 'commandPacingDelayMs',
          type: 'number',
          label: 'Command pacing delay (ms)',
          min: 0,
          description: 'Delay between sequential commands (after a put, and between repeat craft attempts).',
        },
        {
          key: 'pullConfirmTimeoutMs',
          type: 'number',
          label: 'Pull confirm timeout (ms)',
          min: 0,
          description: 'How long to wait after `get` for a vault-failure message before assuming the pull succeeded.',
        },
        {
          key: 'scoreResponseTimeoutMs',
          type: 'number',
          label: 'Score response timeout (ms)',
          min: 0,
          description: 'How long to wait after `score` for the matching craft-rank line before aborting start.',
        },
        {
          key: 'loreResponseTimeoutMs',
          type: 'number',
          label: 'Lore response timeout (ms)',
          min: 0,
          description: 'How long to wait after `lore` for the item\'s Condition line before aborting (order mode only).',
        },
        {
          key: 'orderHoldingContainer',
          type: 'string',
          label: 'Order holding container',
          description: 'Where finished, in-spec order items are stored, ready for manual hand-off.',
          placeholder: 'orders',
        },
        {
          key: 'qualityContainerMap',
          type: 'textarea',
          label: 'Quality → container map',
          description:
            'One row per quality range for items that don\'t match the active order\'s spec: "<range or single value> | <container>". Unmapped qualities default to vault.',
          placeholder: '90-94 | common',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
        },
        {
          key: 'hudSlot',
          type: 'select',
          label: 'HUD widget slot',
          options: [
            { label: 'Bottom strip', value: 'hud.bottomStrip' },
            { label: 'Right column', value: 'hud.rightColumn' },
            { label: 'None', value: 'none' },
          ],
        },
      ],
    },

    onEnable,
    onAlias,
  };
}
