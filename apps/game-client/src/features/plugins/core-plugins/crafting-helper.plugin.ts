// apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts
import type { IPluginModule, PluginRuntimeApi, HudSlotId, HudWidgetContent } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';
import {
  getTrackedSkillLevel,
  setTrackedSkillLevel,
  getOrderQueue,
  addOrder,
  removeOrder,
  updateOrder,
  getCompletedOrders,
  addCompletedOrder,
  MAX_QUEUED_ORDERS,
  countOrders,
  takeDroppedOrderCount,
  onStorageWriteError,
  type StoredCraftOrder,
  type StoredQualitySpec,
} from './crafting-helper-storage';

/**
 * Crafting Helper — automates tier-3 crafting skill-up training and bulk
 * order fulfillment.
 *
 * Config-driven across craft skills (verb, score-rank keyword, and tier
 * table are all data, not code) — ships seeded with Spellcrafting, Sharp
 * Weapons, Blunt Weapons, Armor Crafting, and Tailoring tier tables. A
 * character trains one craft skill at a time, named on the command line.
 *
 * Aliases (type in the command bar) — prefixed with "crafthelper" (or its
 * shorthand "crh"), not "craft", so they never compete with the game's own
 * `craft` command, and namespaced by mode so "start"/"stop"/"status" never
 * mean two different things depending on context:
 *   crafthelper improve <craftType> start  — begin training that craft type
 *   crafthelper improve stop               — finish the current step, then go idle
 *   crafthelper improve status             — print current state/skill/session stats
 *   crafthelper order add/list/remove/start/stop/status/history — bulk order fulfillment
 *   crafthelper / crafthelper help         — print full command help
 *
 * Full command syntax, examples, and behavior notes live in the in-game
 * `crafthelper help` output (see handleHelp below) — kept there, and only
 * there, so this doc comment and the manifest description don't drift out
 * of sync with it.
 */

// Single source of truth for the version shown in both the manifest and the
// in-game help header — bump this, not two separate literals.
const PLUGIN_VERSION = '1.0.0';

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
// points later. The elephant leather saddle trinket (943) is the last
// training trinket — it carries skill to the 1001 cap; silksteel/bull
// elephant (tier index 9) only exists as order-item materials, not a
// training tier. The thread component is "<material> thread" — a craft
// list once showed "a spool of <material> thread", but that's just the
// list's descriptive text; the item you actually get/put is the bare
// "<material> thread".
const TAILORING_TRINKET_TIERS: Array<{
  dollThreshold: number;
  saddleThreshold: number;
  cloth: string;
  leather: string;
}> = [
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
    rows.push(`tailoring | ${dollThreshold} | ${cloth} doll trinket | ${cloth} cloth square:3, ${cloth} thread:3`);
    rows.push(
      `tailoring | ${saddleThreshold} | ${leather} leather saddle trinket | ${cloth} cloth square:2, ${cloth} thread:2, ${leather} leather square:2`,
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
 * Makes a config-sourced string safe to interpolate into a MUD command
 * (`get 1 'name' vault`, `craft verb 'name'`, `put 1 'item' container`).
 * Strips apostrophes (an embedded "ogre's tooth" would break the quoting) and
 * every control character — the client forwards a command verbatim and the MUD
 * input reader treats \r and \n as command terminators, so `vault\rquit` would
 * otherwise become two commands. Runs of whitespace collapse to one space.
 */
export function sanitizeCommandArg(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Item / material / verb names parsed from the tier-table and craft-types config. */
export function sanitizeItemName(name: string): string {
  return sanitizeCommandArg(name);
}

/** A container argument: bare when it is one word (the existing wire format), single-quoted otherwise. */
export function containerArg(container: string): string {
  return /\s/.test(container) ? `'${container}'` : container;
}

// ── Saved-table upgrade guard ─────────────────────────────────────────
// Saving the config modal copies every default into the user's saved config,
// so a recipe fix shipped later would never reach anyone who has saved once.
// A saved table that is byte-for-byte (modulo comments/whitespace) a shipped
// default is treated as "unmodified" and replaced by the current default.
// When a default table changes, add the OLD table's fingerprint here so
// existing saves upgrade. (Fixing this at the source — the modal persisting
// only non-default keys — is tracked in .ai-bug/.)
export const LEGACY_DEFAULT_TABLE_FINGERPRINTS: { craftTypes: readonly string[]; tierTable: readonly string[] } = {
  craftTypes: [],
  tierTable: [],
};

/** FNV-1a (32-bit) over the table with comment lines, blank lines and whitespace runs removed. */
export function tableFingerprint(raw: string): string {
  const normalized = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/\s+/g, ' '))
    .join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The table to parse: the current default when the saved one is an unmodified shipped default, else the saved one. */
export function resolveTableConfig(
  stored: unknown,
  currentDefault: string,
  legacyFingerprints: readonly string[],
): unknown {
  if (typeof stored !== 'string') return stored;
  const fp = tableFingerprint(stored);
  if (fp === tableFingerprint(currentDefault) || legacyFingerprints.includes(fp)) return currentDefault;
  return stored;
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
      components.push({ material: sanitizeItemName(trimmed), qty: 1 });
      continue;
    }
    const material = sanitizeItemName(trimmed.slice(0, idx).trim());
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
    rows.push({
      id: id.toLowerCase(),
      label: sanitizeItemName(label),
      verb: sanitizeItemName(verb),
      keyword: sanitizeItemName(keyword),
    });
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
    rows.push({
      craftTypeId: craftTypeId.toLowerCase(),
      skillThreshold,
      trinket: sanitizeItemName(trinket),
      components,
    });
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
// leather), 6 slots each. A cloth item is named "<material> cloth <slot>"
// (e.g. "silksteel cloth shirt") and needs "<material> thread" +
// "<material> cloth square"; a leather item is named "<leather material>
// leather <slot>" and needs the *same-tier cloth material's* thread +
// "<leather material> leather square" (e.g. "whale leather sleeves" needs
// 2 seamist threads + 2 whale leather squares). Naming corrected against
// real usage more than once: tier 0's "woolen" (not "wool") came from a
// real in-game craft list; the cloth item's "cloth" word (dropped in an
// earlier pass, matching the leather side's "leather" word) and dropping
// the "spool of" thread prefix (a craft list's descriptive text, not the
// actual get/put item name) both came from live reports.
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
    recipes[`${material} cloth ${slot}`] = {
      craftTypeId: 'tailoring',
      components: [
        { material: `${material} thread`, qty },
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
        { material: `${clothMaterial} thread`, qty },
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

// Spellcrafting order gems: a cut gemstone (the same item a training tier
// produces) + one essence, 1 each. Confirmed for opal from a real in-game
// craft list ("opal gem inertia" = opal gemstone + essence of inertia, etc.);
// the user stated the essences are shared across gemstone tiers, so the
// other tiers below are extrapolated from that pattern. Moonstone is
// confirmed ("moonstone gem growth" = moonstone + essence of growth); its
// gemstone item is just "moonstone", not "moonstone gemstone". Diamond also
// has special gems (confirmed from a real craft list) whose extra components
// are not always a plain essence — see DIAMOND_SPECIAL_GEMS.
const SPELL_GEM_ESSENCES: Array<{ suffix: string; essence: string }> = [
  { suffix: 'inertia', essence: 'essence of inertia' },
  { suffix: 'life', essence: 'essence of life' },
  { suffix: 'moons', essence: 'essence of moons' },
  { suffix: 'growth', essence: 'essence of growth' },
  { suffix: 'age', essence: 'essence of age' },
  { suffix: 'mind', essence: 'essence of the mind' },
  { suffix: 'wind', essence: 'essence of wind' },
  { suffix: 'muscle', essence: 'essence of muscle' },
];

// Diamond-only gems, each = diamond gemstone + these components (qty 1 each).
// Note the exceptions: distortion uses a shard, and leeching needs three
// components (essence of moons + a ferrite crystal). "the magi" is the
// literal item-name suffix.
const DIAMOND_SPECIAL_GEMS: Array<{ suffix: string; extras: string[] }> = [
  { suffix: 'distortion', extras: ['shard of distortion'] },
  { suffix: 'leeching', extras: ['essence of moons', 'ferrite crystal'] },
  { suffix: 'confusion', extras: ['essence of confusion'] },
  { suffix: 'venom', extras: ['essence of venom'] },
  { suffix: 'energy', extras: ['essence of energy'] },
  { suffix: 'execution', extras: ['essence of execution'] },
  { suffix: 'steel', extras: ['essence of steel'] },
  { suffix: 'blood', extras: ['essence of blood'] },
  { suffix: 'frost', extras: ['essence of frost'] },
  { suffix: 'flame', extras: ['essence of flame'] },
  { suffix: 'the magi', extras: ['essence of the magi'] },
  { suffix: 'pain', extras: ['essence of pain'] },
  { suffix: 'sight', extras: ['essence of sight'] },
];

const SPELL_GEM_TIERS: Array<{ tier: string; gemstone: string }> = [
  { tier: 'obsidian', gemstone: 'obsidian gemstone' },
  { tier: 'moonstone', gemstone: 'moonstone' },
  { tier: 'opal', gemstone: 'opal gemstone' },
  { tier: 'amethyst', gemstone: 'amethyst gemstone' },
  { tier: 'emerald', gemstone: 'emerald gemstone' },
  { tier: 'sapphire', gemstone: 'sapphire gemstone' },
  { tier: 'ruby', gemstone: 'ruby gemstone' },
  { tier: 'diamond', gemstone: 'diamond gemstone' },
];

function spellGemSets(): Record<string, OrderItemRecipe> {
  const recipes: Record<string, OrderItemRecipe> = {};
  for (const { tier, gemstone } of SPELL_GEM_TIERS) {
    for (const { suffix, essence } of SPELL_GEM_ESSENCES) {
      recipes[`${tier} gem ${suffix}`] = {
        craftTypeId: 'spellcrafting',
        components: [
          { material: gemstone, qty: 1 },
          { material: essence, qty: 1 },
        ],
      };
    }
  }
  for (const { suffix, extras } of DIAMOND_SPECIAL_GEMS) {
    recipes[`diamond gem ${suffix}`] = {
      craftTypeId: 'spellcrafting',
      components: [{ material: 'diamond gemstone', qty: 1 }, ...extras.map((material) => ({ material, qty: 1 }))],
    };
  }
  return recipes;
}

const ARCANIUM_ARMOR_SETS: Array<{ setName: string; slotQty: Record<string, number> }> = [
  { setName: 'platemail', slotQty: { helmet: 1, boots: 1, leggings: 2, gloves: 1, sleeves: 2, tunic: 4 } },
  { setName: 'chainmail', slotQty: { boots: 1, leggings: 2, gloves: 1, sleeves: 2, tunic: 4, helmet: 1 } },
  { setName: 'studded leather', slotQty: { boots: 1, pants: 2, gloves: 1, sleeves: 2, tunic: 4, helmet: 1 } },
];

// Hardcoded, not config — this data rarely changes and the user does not
// want to maintain an override surface for it. Add new order items here.
export const ORDER_ITEM_RECIPES: Record<string, OrderItemRecipe> = {
  ...spellGemSets(),
  ...tailoringSets(),
  ...ARCANIUM_ARMOR_SETS.reduce<Record<string, OrderItemRecipe>>(
    (acc, { setName, slotQty }) => ({ ...acc, ...arcaniumArmorSet(setName, slotQty) }),
    {},
  ),
};

// "Sets" — order one of each slot in a tailoring material or an armor-crafting
// set with a single order-add call ("silksteel cloth set", "bull elephant
// leather set", "arcanium chainmail set") instead of naming all 6 slots
// individually. The trailing "set" word is always required — unifying the
// two families avoids a case where "arcanium chainmail" (no suffix) reads
// ambiguously next to "silksteel cloth set" (suffix required). Each key maps
// to the ordered list of its member item names — already-defined keys in
// ORDER_ITEM_RECIPES above — and `order add` fans a set out into one queued
// order per member, sharing the requested quantity and quality spec.
function tailoringSetGroups(): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const { cloth, leather } of TAILORING_TIERS) {
    groups[`${cloth} cloth set`] = Object.keys(TAILORING_SLOT_QTY).map((slot) => `${cloth} cloth ${slot}`);
    groups[`${leather} leather set`] = Object.keys(TAILORING_SLOT_QTY).map((slot) => `${leather} leather ${slot}`);
  }
  return groups;
}

function armorSetGroups(): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const { setName, slotQty } of ARCANIUM_ARMOR_SETS) {
    groups[`arcanium ${setName} set`] = Object.keys(slotQty).map((slot) => `arcanium ${setName} ${slot}`);
  }
  return groups;
}

export const ORDER_SET_RECIPES: Record<string, string[]> = {
  ...tailoringSetGroups(),
  ...armorSetGroups(),
};

// Plain-object bracket lookups on a player-typed key are exploitable: e.g.
// `order add 1 'constructor' 99+` resolves ORDER_SET_RECIPES['constructor']
// to Object's constructor function (truthy), bypassing the "unknown item"
// check downstream. hasOwnProperty.call rejects every inherited property
// name (constructor, __proto__, toString, hasOwnProperty, valueOf, ...),
// not just the one in the live repro.
export function getOrderItemRecipe(name: string): OrderItemRecipe | undefined {
  return Object.prototype.hasOwnProperty.call(ORDER_ITEM_RECIPES, name) ? ORDER_ITEM_RECIPES[name] : undefined;
}

export function getOrderSetRecipe(name: string): string[] | undefined {
  return Object.prototype.hasOwnProperty.call(ORDER_SET_RECIPES, name) ? ORDER_SET_RECIPES[name] : undefined;
}

export type QualitySpec = StoredQualitySpec;

// Item condition is a percentage — across the whole player-log corpus a lore
// "Condition: ... (N%)" never exceeds 100 — so a spec above that can never be met.
const MAX_QUALITY = 100;
// Largest quantity one `order add` may request.
const MAX_ORDER_QTY = 500;

export function parseQualitySpec(raw: string): QualitySpec | null {
  const trimmed = raw.trim();

  const atLeast = trimmed.match(/^(\d+)\+$/);
  if (atLeast) {
    const min = parseInt(atLeast[1], 10);
    return min <= MAX_QUALITY ? { kind: 'atLeast', min } : null;
  }

  const range = trimmed.match(/^(\d+)-(\d+)$/);
  if (range) {
    const min = parseInt(range[1], 10);
    const max = parseInt(range[2], 10);
    return min <= max && max <= MAX_QUALITY ? { kind: 'range', min, max } : null;
  }

  const exact = trimmed.match(/^(\d+)$/);
  if (exact) {
    const value = parseInt(exact[1], 10);
    return value <= MAX_QUALITY ? { kind: 'exact', value } : null;
  }

  return null;
}

export function qualityMatchesSpec(quality: number, spec: QualitySpec): boolean {
  if (spec.kind === 'atLeast') return quality >= spec.min;
  if (spec.kind === 'exact') return quality === spec.value;
  return quality >= spec.min && quality <= spec.max;
}

export function formatQualitySpec(spec: QualitySpec): string {
  if (spec.kind === 'atLeast') return `${spec.min}+`;
  if (spec.kind === 'exact') return `${spec.value}`;
  return `${spec.min}-${spec.max}`;
}

export function formatMaterialsUsed(materials: Record<string, number>): string {
  const entries = Object.entries(materials);
  if (entries.length === 0) return 'none recorded';
  return entries.map(([material, qty]) => `${material} x${qty}`).join(', ');
}

/** Lowercase, hyphenated, alphanumeric-only — for building a readable order id. */
export function slugifyItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * A quality spec as a word token instead of symbols (+/-), so an order id
 * built from it stays plain text: "gte" (greater than or equal), "eq"
 * (exact), or "<min>to<max>" (range).
 */
export function qualitySpecToken(spec: QualitySpec): string {
  if (spec.kind === 'atLeast') return `gte${spec.min}`;
  if (spec.kind === 'exact') return `eq${spec.value}`;
  return `${spec.min}to${spec.max}`;
}

/** A readable, human-scannable order id: "<item>-<quality>-<random>". */
export function makeOrderId(itemName: string, qualitySpec: QualitySpec): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slugifyItemName(itemName)}-${qualitySpecToken(qualitySpec)}-${suffix}`;
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
    const [rangeStr, rawContainer] = parts;
    const container = sanitizeCommandArg(rawContainer);
    if (!container) continue;

    const range = rangeStr.match(/^(\d+)-(\d+)$/);
    if (range) {
      const min = parseInt(range[1], 10);
      const max = parseInt(range[2], 10);
      if (min <= max) rows.push({ min, max, container });
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

/** The mapped container for a quality, or null if no row covers it. */
export function matchQualityContainer(quality: number, rows: QualityContainerRow[]): string | null {
  for (const row of rows) {
    if (quality >= row.min && quality <= row.max) return row.container;
  }
  return null;
}

// ── Line matchers (applied per-line, after stripAnsi + split('\n') + trim —
// sidesteps the `$`-anchor/trailing-\n gotcha entirely) ───────────────────

const SCORE_LINE_RE = /^Craftskill:\s*(\d+)\s+Craft Rank:\s*(.+)$/i;

export function findCraftSkillLevel(input: string | string[], keyword: string): number | null {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return null;
  const lines = Array.isArray(input) ? input : input.split('\n');
  for (const rawLine of lines) {
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
const COPYOVER_RECOVERY_TEXT = 'Copyover recovery complete.';
// Every matcher below accepts a WHOLE line only. The stream the plugin reads
// also carries other players' say/channel text (`Name says, "..."`,
// `Name grats '...'`, `Name OOC: '...'`, `You OOC: '...'`), and a substring
// match would treat anything a player types as authoritative game output.
// Verified against the player-log corpus: the copyover and vault-failure lines
// are always whole lines (103 / 59 occurrences, never prefixed, never inside
// speech), while all four real occurrences of the skill-up text are inside
// player chat — i.e. the spoof is not hypothetical.
const SKILL_IMPROVED_RE = /^Your crafting skill has improved\.\s*\((\d+)\)$/;
// Lore output prints either `Condition: good (90%)` or, for small items,
// `Size: tiny   Condition: good (90%)` on one line (3200 of 5315 corpus lines
// carry the Size prefix) — nothing else may precede it.
const CONDITION_RE = /^(?:Size:\s*[^:()]{1,24}?\s+)?Condition:\s*[^(]+\(\s*(\d+)%\s*\)$/;
// A successful vault pull prints e.g. "You get a silksteel cloth helmet from the mystic vault."
const PULL_SUCCESS_RE = /^You get .+ from .*vault\.$/;

const isSystemLine = (line: string, text: string): boolean => line.trim() === text;

export function matchCraftOutcome(line: string): CraftOutcome {
  if (isSystemLine(line, OUTCOME_SUCCESS)) return 'success';
  if (isSystemLine(line, OUTCOME_DESTROYED)) return 'failed_destroyed';
  if (isSystemLine(line, OUTCOME_NO_LOSS)) return 'failed_no_loss';
  return null;
}

export function matchSkillImproved(line: string): number | null {
  const m = line.trim().match(SKILL_IMPROVED_RE);
  return m ? parseInt(m[1], 10) : null;
}

export function matchVaultFailure(line: string): boolean {
  return isSystemLine(line, VAULT_FAILURE_TEXT);
}

export function matchPullSuccess(line: string): boolean {
  return PULL_SUCCESS_RE.test(line.trim());
}

// `You put a traveler's diary in the mystic vault.` — the only put reply shape in the player-log corpus.
const PUT_SUCCESS_RE = /^You put .+ in .+\.$/;
// A put of something not held (corpus: 9 of 24 first replies in one session).
const PUT_FAILURE_TEXT = 'You do not have that item.';

export function matchPutSuccess(line: string): boolean {
  return PUT_SUCCESS_RE.test(line.trim());
}

export function matchPutFailure(line: string): boolean {
  return isSystemLine(line, PUT_FAILURE_TEXT);
}

export function matchCraftInterrupted(line: string): boolean {
  return isSystemLine(line, CRAFT_INTERRUPTED_TEXT);
}

export function matchCopyoverRecovery(line: string): boolean {
  return isSystemLine(line, COPYOVER_RECOVERY_TEXT);
}

export function matchItemCondition(line: string): number | null {
  const m = line.trim().match(CONDITION_RE);
  if (!m) return null;
  const pct = parseInt(m[1], 10);
  // Condition is a percentage; the corpus never exceeds 100.
  return pct <= MAX_QUALITY ? pct : null;
}

// A genuine skill-up raises the tracked level by one. Anything that lands far
// above (or at/below) the tracked level is not a skill-up of this character.
const SKILL_CAP = 1001;
const MAX_SKILL_STEP = 5;
export function isPlausibleSkillUp(newLevel: number, tracked: number | null): boolean {
  if (!Number.isInteger(newLevel) || newLevel < 1 || newLevel > SKILL_CAP) return false;
  if (tracked == null) return true;
  return newLevel > tracked && newLevel - tracked <= MAX_SKILL_STEP;
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
  /** e.g. "improving Spellcrafting" or "working on order <id>". */
  activity?: string | null;
}): HudWidgetContent | null {
  const { state, everRun, trackedSkillLevel, activeItemName, stopReason, activity } = input;

  // Never started: don't occupy a slot for a plugin that hasn't run yet.
  if (!everRun && state === 'idle') return null;

  if (state === 'error_stopped') {
    return { label: 'Crafting Helper', value: `Stopped: ${stopReason ?? 'error'}`, variant: 'critical' };
  }

  if (state === 'idle') {
    return { label: 'Crafting Helper', value: 'Stopped', variant: 'default' };
  }

  const parts = [
    activity,
    trackedSkillLevel != null ? `Lv ${trackedSkillLevel}` : null,
    activeItemName,
    phaseLabel(state),
  ].filter((p): p is string => !!p);

  return { label: 'Crafting Helper', value: parts.join(' · '), variant: 'default' };
}

// ── Config reading ────────────────────────────────────────────────────

interface EngineConfig {
  craftTypes: CraftTypeRow[];
  tierTable: CraftTierRow[];
  commandPacingDelayMs: number;
  pullConfirmTimeoutMs: number;
  scoreResponseTimeoutMs: number;
  loreResponseTimeoutMs: number;
  craftResponseTimeoutMs: number;
  orderHoldingContainer: string;
  qualityContainerMap: QualityContainerRow[];
  debug: boolean;
  hudSlot: HudSlotId | 'none';
  /** `order add` on an empty queue starts fulfilling immediately (default on). */
  autoStartOnOrderAdd: boolean;
  /** Stop after this many failed crafts in a row. */
  maxConsecutiveFailures: number;
  /** Stop an order once its crafts exceed quantity × this many attempts. */
  maxAttemptsPerItem: number;
  /** Stop when more than this many commands go out within COMMAND_WINDOW_MS. */
  maxCommandsPerWindow: number;
}

/**
 * A finite number inside [min, max], else the fallback. Unlike a bare
 * `Number(v)`, this rejects the values that turn a timeout into a footgun:
 * '' and null (both coerce to 0), 0 itself, negatives, and anything past the
 * 2^31-1 ms `setTimeout` ceiling (browsers fire those after ~1 ms).
 */
export function numIn(v: unknown, fallback: number, min: number, max: number): number {
  if (v === null || v === undefined || typeof v === 'boolean') return fallback;
  if (typeof v === 'string' && v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.trunc(n) : fallback;
}

const ONE_HOUR_MS = 3_600_000;
export const COMMAND_WINDOW_MS = 10_000;

/**
 * Wraps a pure parser so an unchanged raw config string skips re-parsing.
 * `getConfig()` is still read fresh on every call (never cached) — only the
 * expensive regex-split-per-line work on an unchanged string is skipped.
 * Cheap for the common case: every mid-cycle `handleRawData` call reads
 * config, and craftTypes/tierTable/qualityContainerMap rarely change
 * between one incoming line and the next.
 */
function memoizeLast<T>(fn: (raw: unknown) => T): (raw: unknown) => T {
  let lastRaw: unknown;
  let lastResult: T;
  let hasCached = false;
  return (raw: unknown) => {
    if (hasCached && raw === lastRaw) return lastResult;
    lastResult = fn(raw);
    lastRaw = raw;
    hasCached = true;
    return lastResult;
  };
}

const parseCraftTypesConfigMemo = memoizeLast((raw) =>
  parseCraftTypesConfig(
    resolveTableConfig(raw, DEFAULT_CRAFT_TYPES_CONFIG, LEGACY_DEFAULT_TABLE_FINGERPRINTS.craftTypes),
  ),
);
const parseTierTableConfigMemo = memoizeLast((raw) =>
  parseTierTableConfig(resolveTableConfig(raw, DEFAULT_TIER_TABLE_CONFIG, LEGACY_DEFAULT_TABLE_FINGERPRINTS.tierTable)),
);
const parseQualityContainerMapMemo = memoizeLast(parseQualityContainerMap);

function readConfig(api: PluginRuntimeApi): EngineConfig {
  const cfg = api.getConfig();
  const hudSlot = cfg.hudSlot;
  return {
    craftTypes: parseCraftTypesConfigMemo(cfg.craftTypes),
    tierTable: parseTierTableConfigMemo(cfg.tierTable),
    commandPacingDelayMs: numIn(cfg.commandPacingDelayMs, 150, 50, 5_000),
    pullConfirmTimeoutMs: numIn(cfg.pullConfirmTimeoutMs, 200, 50, 10_000),
    scoreResponseTimeoutMs: numIn(cfg.scoreResponseTimeoutMs, 1000, 100, 60_000),
    loreResponseTimeoutMs: numIn(cfg.loreResponseTimeoutMs, 2000, 100, 60_000),
    craftResponseTimeoutMs: numIn(cfg.craftResponseTimeoutMs, 180_000, 100, ONE_HOUR_MS),
    orderHoldingContainer:
      (typeof cfg.orderHoldingContainer === 'string' && sanitizeCommandArg(cfg.orderHoldingContainer)) || 'vault',
    qualityContainerMap: parseQualityContainerMapMemo(cfg.qualityContainerMap),
    debug: cfg.debug === true,
    hudSlot:
      hudSlot === 'hud.bottomStrip' || hudSlot === 'hud.rightColumn' || hudSlot === 'none'
        ? hudSlot
        : 'hud.bottomStrip',
    autoStartOnOrderAdd: cfg.autoStartOnOrderAdd !== false,
    maxConsecutiveFailures: numIn(cfg.maxConsecutiveFailures, 15, 1, 10_000),
    maxAttemptsPerItem: numIn(cfg.maxAttemptsPerItem, 100, 1, 10_000),
    maxCommandsPerWindow: numIn(cfg.maxCommandsPerWindow, 120, 20, 1_000),
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
  let session: SessionStats | null = null;

  // Components pulled from the vault that a craft hasn't consumed yet — if
  // the run stops, these go back into the vault.
  let materialsHeld: RecipeComponent[] | null = null;
  let lastPublishedSlot: HudSlotId | null = null;

  // ── Timers ────────────────────────────────────────────────────────────
  // One handle per slot, and a slot is never overwritten while live: a
  // duplicate or spoofed outcome line used to schedule a second timer on top
  // of the first, orphaning it where no clearTimeout could reach it (an
  // orphaned craft watchdog later aborted a healthy run). `epoch` is bumped by
  // clearAllTimers, so a callback that was already queued when the run was
  // reset or errored is a no-op instead of acting on the next run's state.
  type TimerSlot = 'score' | 'pull' | 'pacing' | 'quality' | 'release' | 'craft' | 'put';
  const timers: Partial<Record<TimerSlot, ReturnType<typeof setTimeout>>> = {};
  let epoch = 0;

  function clearSlot(slot: TimerSlot) {
    const handle = timers[slot];
    if (handle !== undefined) {
      clearTimeout(handle);
      delete timers[slot];
    }
  }

  function hasTimer(slot: TimerSlot): boolean {
    return timers[slot] !== undefined;
  }

  function schedule(slot: TimerSlot, ms: number, fn: () => void) {
    // A run stopped by the command-rate limit must not re-arm anything from the
    // callback that tripped it.
    if (rateLimitTripped) return;
    clearSlot(slot);
    const armedIn = epoch;
    timers[slot] = setTimeout(() => {
      delete timers[slot];
      if (armedIn === epoch) fn();
    }, ms);
  }

  function clearAllTimers() {
    epoch += 1;
    (Object.keys(timers) as TimerSlot[]).forEach(clearSlot);
  }

  // ── Re-entrancy guards, brakes ─────────────────────────────────────────
  // True only between sending `craft` and consuming its first outcome line. A
  // second outcome / interrupt / copyover line while false (pacing gap, destroyed
  // put-back chain) belongs to no craft in flight and is ignored.
  let outcomePending = false;
  // Same for the `lore` reply in order mode.
  let qualityPending = false;
  // Order mode: the crafted item's `put` is out and its reply has not arrived. The order is credited
  // only once the server confirms the put; a refusal or silence credits nothing and stops the run.
  interface PendingPut {
    outputName: string;
    quality: number;
    container: string;
    inSpec: boolean;
  }
  let pendingPut: PendingPut | null = null;
  // Copyover recraft allowance: one resend per craft attempt.
  const MAX_COPYOVER_RECRAFTS_PER_ATTEMPT = 1;
  let recraftsThisAttempt = 0;
  let consecutiveFailures = 0;
  let orderAttempts = 0;
  // Successful vault pulls seen this pull cycle ("You get ... from the vault.").
  let confirmedPulls = 0;
  // Sliding window of command send times for the rate limit; once tripped, sends are dropped until the next start.
  let sentTimes: number[] = [];
  let rateLimitTripped = false;
  // The character the active run belongs to. Storage writes made by the engine use this, not the
  // live identity, so a character switch mid-run can never write under the new character's name.
  let runKey: string | null = null;
  const runCharacter = () => runKey ?? characterKey();

  /** The single place the plugin sends a command: rate limit + optional debug trace. */
  function send(api: PluginRuntimeApi, cmd: string) {
    if (rateLimitTripped) return;
    const cfg = readConfig(api);
    const now = Date.now();
    sentTimes = sentTimes.filter((t) => now - t < COMMAND_WINDOW_MS);
    if (sentTimes.length >= cfg.maxCommandsPerWindow) {
      rateLimitTripped = true;
      enterError(
        api,
        cfg,
        `Command rate limit hit (${cfg.maxCommandsPerWindow} commands in ${COMMAND_WINDOW_MS / 1000}s) — stopped to avoid flooding the MUD. Pulled materials may still be in your inventory.`,
      );
      return;
    }
    sentTimes.push(now);
    if (cfg.debug) api.log(`send: ${cmd}`);
    api.sendCommand(cmd);
  }

  /**
   * Abandons the run without sending anything (the connection may be gone and
   * the host may be tearing the plugin down) and reports what is still held.
   */
  function resetEngine(api: PluginRuntimeApi, reason: string, publish = true) {
    const held = materialsHeld;
    const wasActive = state !== 'idle' || (held?.length ?? 0) > 0;
    clearAllTimers();
    state = 'idle';
    mode = 'improve';
    stopRequested = false;
    stopReason = null;
    activeRecipe = null;
    activeOrder = null;
    activeOrderRemoved = false;
    materialsHeld = null;
    session = null;
    orderSession = null;
    pullIndex = 0;
    runKey = null;
    outcomePending = false;
    qualityPending = false;
    pendingPut = null;
    recraftsThisAttempt = 0;
    consecutiveFailures = 0;
    orderAttempts = 0;
    confirmedPulls = 0;
    sentTimes = [];
    rateLimitTripped = false;
    if (wasActive) {
      const list = held?.length
        ? ` Still in your inventory: ${held.map((c) => `${c.qty}x ${c.material}`).join(', ')}.`
        : '';
      writeInfo(api, `${reason}.${list}`);
    }
    if (publish) publishHud(api, readConfig(api));
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
      activity:
        mode === 'order'
          ? activeOrder
            ? `working on order ${activeOrder.id}`
            : 'working on orders'
          : `improving ${activeCraftTypeRow?.label ?? '?'}`,
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
      const orderRecipe = getOrderItemRecipe(activeOrder.itemName);
      return orderRecipe ? { outputName: activeOrder.itemName, components: orderRecipe.components } : null;
    }
    if (trackedSkillLevel == null || !activeCraftTypeRow) return null;
    const row = tierForSkill(activeCraftTypeRow.id, trackedSkillLevel, cfg.tierTable);
    return row ? tierRowToRecipe(row) : null;
  }

  // ── handleCraftSuccess — improve-mode / order-mode seam ──────────────
  function handleCraftSuccess(api: PluginRuntimeApi, cfg: EngineConfig, recipe: ResolvedRecipe) {
    if (mode === 'improve') {
      send(api, `put 1 '${recipe.outputName}' vault`);
      schedule('pacing', cfg.commandPacingDelayMs, () => beginPullCycle(api));
      return;
    }
    state = 'checking_quality';
    publishHud(api, cfg);
    qualityPending = true;
    send(api, `lore '${recipe.outputName}'`);
    schedule('quality', cfg.loreResponseTimeoutMs, () => onQualityTimeout(api));
  }

  // Order mode only — tallies raw-material spend against the active order,
  // for later cost lookup (`crafthelper order history`). A "destroyed"
  // outcome is counted as a full loss of every pulled component, per
  // explicit instruction: don't try to guess partial loss, just assume all
  // of it. That's an accounting assumption only — independent of
  // beginDestroyedRecovery's own, unrelated decision to put everything back
  // and re-pull, since the "destroyed" message itself isn't reliable.
  function recordMaterialsUsed(components: RecipeComponent[]) {
    if (mode !== 'order' || !activeOrder) return;
    const tally: Record<string, number> = { ...(activeOrder.materialsUsed ?? {}) };
    for (const c of components) {
      tally[c.material] = (tally[c.material] ?? 0) + c.qty;
    }
    activeOrder = { ...activeOrder, materialsUsed: tally };
    updateOrder(runCharacter(), activeOrder.id, { materialsUsed: tally });
  }

  function onQualityTimeout(api: PluginRuntimeApi) {
    qualityPending = false;
    const cfg = readConfig(api);
    // The craft succeeded, so don't leave the item in inventory: with no
    // quality reading there's no better home than the default (vault).
    if (activeRecipe) send(api, `put 1 '${activeRecipe.outputName}' vault`);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    enterError(
      api,
      cfg,
      `Couldn't verify quality of "${activeRecipe?.outputName}" within ${cfg.loreResponseTimeoutMs}ms — stopped rather than guess where to route it; put it in the vault.`,
    );
  }

  function resolveOrderQuality(api: PluginRuntimeApi, cfg: EngineConfig, quality: number) {
    qualityPending = false;
    if (!activeRecipe) {
      enterError(api, cfg, 'Internal error: no active recipe.');
      return;
    }
    const outputName = activeRecipe.outputName;
    const order = activeOrderRemoved ? null : activeOrder;
    const inSpec = order != null && qualityMatchesSpec(quality, order.qualitySpec);

    // The quality map wins whenever it covers this quality, even for an item
    // that also satisfies the active order — carving out a bracket (e.g.
    // "flawless goes to orb") doesn't cost the order its credit, since
    // whether this counts toward the order depends only on `inSpec` below,
    // not on which container it physically lands in.
    const mappedContainer = matchQualityContainer(quality, cfg.qualityContainerMap);
    const container = mappedContainer ?? (inSpec ? cfg.orderHoldingContainer : 'vault');
    send(api, `put 1 '${outputName}' ${containerArg(container)}`);
    if (rateLimitTripped) return; // the send tripped the limit and already stopped the run: credit nothing

    // Credit and routing wait for the server's reply to the put (see creditOrderPut).
    pendingPut = { outputName, quality, container, inSpec };
    state = 'storing_trinket';
    publishHud(api, cfg);
    schedule('put', cfg.loreResponseTimeoutMs, () => onPutTimeout(api));
  }

  function onPutTimeout(api: PluginRuntimeApi) {
    const p = pendingPut;
    pendingPut = null;
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    enterError(
      api,
      cfg,
      `No confirmation that "${p?.outputName}" was stored in ${p?.container} within ${cfg.loreResponseTimeoutMs}ms — order not credited; check your inventory, then run \`crafthelper order stop\` and \`crafthelper order start\` to continue.`,
    );
  }

  function onPutRefused(api: PluginRuntimeApi, cfg: EngineConfig) {
    const p = pendingPut;
    pendingPut = null;
    enterError(
      api,
      cfg,
      `The server refused to store "${p?.outputName}" in ${p?.container} ("${PUT_FAILURE_TEXT}") — order not credited; check your inventory, then run \`crafthelper order stop\` and \`crafthelper order start\` to continue.`,
    );
  }

  /** The put was confirmed: credit the order (if the item met its spec) and move to the next craft. */
  function creditOrderPut(api: PluginRuntimeApi, cfg: EngineConfig, p: PendingPut) {
    const { outputName, quality, container, inSpec } = p;
    const order = activeOrderRemoved ? null : activeOrder;

    if (inSpec && order) {
      if (orderSession) orderSession.inSpecRouted += 1;
      const remaining = order.quantityRemaining - 1;
      const done = order.quantityTotal - remaining;
      if (remaining <= 0) {
        const materialsUsed = order.materialsUsed ?? {};
        writeInfo(
          api,
          `Order ${order.id} complete: "${outputName}" @ ${quality}% (in spec) — ${order.quantityTotal}/${order.quantityTotal} done, routed to ${container}.`,
        );
        writeInfo(api, `Order ${order.id} materials used: ${formatMaterialsUsed(materialsUsed)}.`);
        addCompletedOrder(runCharacter(), {
          id: order.id,
          itemName: order.itemName,
          quantityTotal: order.quantityTotal,
          qualitySpec: order.qualitySpec,
          materialsUsed,
          createdAt: order.createdAt,
          completedAt: Date.now(),
        });
        removeOrder(runCharacter(), order.id);
        activeOrder = null;
        schedule('pacing', cfg.commandPacingDelayMs, () => advanceOrderQueue(api));
      } else {
        writeInfo(
          api,
          `"${outputName}" @ ${quality}% (in spec) — order ${order.id}: ${done}/${order.quantityTotal} done, ${remaining} remaining, routed to ${container}.`,
        );
        updateOrder(runCharacter(), order.id, { quantityRemaining: remaining });
        activeOrder = { ...order, quantityRemaining: remaining };
        schedule('pacing', cfg.commandPacingDelayMs, () => beginPullCycle(api));
      }
    } else {
      if (orderSession) orderSession.offSpecRouted += 1;
      if (activeOrderRemoved) {
        writeInfo(
          api,
          `"${outputName}" @ ${quality}% crafted — its order was removed mid-craft, routed to ${container}.`,
        );
        activeOrderRemoved = false;
        schedule('pacing', cfg.commandPacingDelayMs, () => advanceOrderQueue(api));
      } else {
        if (order) {
          const done = order.quantityTotal - order.quantityRemaining;
          writeInfo(
            api,
            `"${outputName}" @ ${quality}% — off spec for order ${order.id} (needs ${formatQualitySpec(order.qualitySpec)}), routed to ${container}; order still at ${done}/${order.quantityTotal}.`,
          );
        }
        schedule('pacing', cfg.commandPacingDelayMs, () => beginPullCycle(api));
      }
    }
  }

  function advanceOrderQueue(api: PluginRuntimeApi) {
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    const queue = getOrderQueue(runCharacter());
    if (queue.length === 0) {
      mode = 'improve';
      goIdle(api, cfg);
      return;
    }
    const next = queue[0];
    const orderRecipe = getOrderItemRecipe(next.itemName);
    if (!orderRecipe) {
      enterError(
        api,
        cfg,
        `Order ${next.id} ("${next.itemName}") no longer has a known recipe — remove it with \`crafthelper order remove ${next.id}\` and re-add it under a valid name.`,
      );
      return;
    }
    const typeRow = cfg.craftTypes.find((t) => t.id === orderRecipe.craftTypeId);
    if (!typeRow) {
      enterError(
        api,
        cfg,
        `Craft type "${orderRecipe.craftTypeId}" for order ${next.id} ("${next.itemName}") isn't configured — valid craft types: ${craftTypeOptionsText(cfg)}.`,
      );
      return;
    }
    activeOrder = next;
    activeOrderRemoved = false;
    activeCraftTypeRow = typeRow;
    orderAttempts = 0;
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
      if (i >= held.length) return;
      schedule('release', cfg.commandPacingDelayMs, () => {
        send(api, `put ${held[i].qty} '${held[i].material}' vault`);
        step(i + 1);
      });
    };
    step(0);
  }

  function goIdle(api: PluginRuntimeApi, cfg: EngineConfig) {
    stopRequested = false;
    state = 'idle';
    activeRecipe = null;
    activeOrder = null;
    outcomePending = false;
    qualityPending = false;
    pendingPut = null;
    runKey = null;
    consecutiveFailures = 0;
    orderAttempts = 0;
    recraftsThisAttempt = 0;
    // The run is over, so the rate-limit window starts clean and the put-backs below may be sent.
    rateLimitTripped = false;
    sentTimes = [];
    publishHud(api, cfg);
    writeInfo(api, 'Stopped.');
    releaseMaterials(api, cfg);
  }

  function enterError(api: PluginRuntimeApi, cfg: EngineConfig, reason: string) {
    clearAllTimers();
    state = 'error_stopped';
    stopReason = reason;
    outcomePending = false;
    qualityPending = false;
    pendingPut = null;
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
    if (orderBudgetExhausted(cfg)) {
      enterError(api, cfg, orderBudgetMessage());
      return;
    }

    const recipe = resolveNextRecipe(cfg);
    if (!recipe) {
      enterError(
        api,
        cfg,
        `Skill level ${trackedSkillLevel} has no matching tier for "${activeCraftTypeRow?.label ?? activeCraftTypeRow?.id ?? '?'}" in the Tier table config — check that it has a row at or below this skill level.`,
      );
      return;
    }

    activeRecipe = recipe;
    pullIndex = 0;
    confirmedPulls = 0;
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
    send(api, `get ${component.qty} '${component.material}' vault`);
    schedule('pull', cfg.pullConfirmTimeoutMs, () => onPullTimeout(api));
  }

  function onPullTimeout(api: PluginRuntimeApi) {
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    pullIndex += 1;
    pullComponent(api, cfg);
  }

  /** `recraft` re-sends the craft of the SAME attempt (after a copyover); it does not reset the recraft allowance. */
  function sendCraft(api: PluginRuntimeApi, cfg: EngineConfig, recraft = false) {
    if (!activeCraftTypeRow || !activeRecipe) {
      enterError(api, cfg, 'Internal error: no active craft type/recipe.');
      return;
    }
    state = 'crafting';
    outcomePending = true;
    if (!recraft) recraftsThisAttempt = 0;
    publishHud(api, cfg);
    send(api, `craft ${activeCraftTypeRow.verb} '${activeRecipe.outputName}'`);
    // Bounded safety net: one of the three known outcome lines almost always
    // arrives quickly, but an unrecognized server message must not hang the
    // engine forever — craftResponseTimeoutMs is long
    // (default 180s) because a craft can legitimately take up to ~2.5 ticks
    // (reported live: over 150s) to resolve on higher tiers.
    schedule('craft', cfg.craftResponseTimeoutMs, () => onCraftTimeout(api));
  }

  function onCraftTimeout(api: PluginRuntimeApi) {
    const cfg = readConfig(api);
    // Same stopRequested check sibling timeouts need — a stop
    // that races this timeout must land in a clean idle, not an alarming
    // error_stopped.
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    enterError(
      api,
      cfg,
      `No recognized outcome for "${activeRecipe?.outputName}" within ${cfg.craftResponseTimeoutMs}ms — stopped rather than wait forever on unmatched text.`,
    );
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
    // Deliberately no stopRequested check here: a requested stop must still
    // finish returning the materials — beginPullCycle (reached once they're
    // all put back) is what turns the stop into idle.
    if (index >= components.length) {
      schedule('pacing', cfg.commandPacingDelayMs, () => beginPullCycle(api));
      return;
    }
    schedule('pacing', cfg.commandPacingDelayMs, () => {
      const component = components[index];
      send(api, `put ${component.qty} '${component.material}' vault`);
      putBackComponent(api, cfg, components, index + 1);
    });
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

    // A run belongs to the character that started it: if the identity changed
    // under it (relog / switch on the same connection), abandon it rather than
    // write progress under the new character's name or send commands there.
    if (runKey && characterKey() !== runKey) {
      resetEngine(api, 'Character changed mid-run — run abandoned');
      return;
    }

    const cfg = readConfig(api);
    const plain = stripAnsi(rawText).replace(/\r/g, '');
    const lines = plain
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (state === 'awaiting_score') {
      const level = findCraftSkillLevel(lines, activeCraftTypeRow?.keyword ?? '');
      if (level != null) {
        clearSlot('score');
        trackedSkillLevel = level;
        if (activeCraftTypeRow) setTrackedSkillLevel(runCharacter(), activeCraftTypeRow.id, level);
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
    for (const line of lines) {
      const improved = matchSkillImproved(line);
      if (improved == null) continue;
      // The level picks which tier's materials get pulled and crafted, so it must be a
      // genuine +1..+5 step from the tracked level, never a value that merely looks right.
      if (!isPlausibleSkillUp(improved, trackedSkillLevel)) {
        if (cfg.debug) api.log(`ignored implausible skill-up ${improved} (tracked ${trackedSkillLevel})`);
        continue;
      }
      trackedSkillLevel = improved;
      if (activeCraftTypeRow) setTrackedSkillLevel(runCharacter(), activeCraftTypeRow.id, improved);
      if (session) session.skillGains += 1;
      publishHud(api, cfg);
    }

    // The skill-up line follows the success line, typically in the next
    // payload — by then a success has already moved state to
    // storing_trinket, so that state must be let through to the scan above.
    if (state === 'storing_trinket') {
      if (!pendingPut) return;
      for (const line of lines) {
        if (matchPutFailure(line)) {
          clearSlot('put');
          onPutRefused(api, cfg);
          return;
        }
        if (matchPutSuccess(line)) {
          clearSlot('put');
          const confirmed = pendingPut;
          pendingPut = null;
          creditOrderPut(api, cfg, confirmed);
          return;
        }
      }
      return;
    }

    if (state === 'pulling_components') {
      for (const line of lines) {
        if (matchPullSuccess(line)) {
          // Replies come back in the order the gets were sent, so the first pull that has no
          // success line yet is the one a vault-failure line belongs to.
          confirmedPulls = Math.min(confirmedPulls + 1, pullIndex + 1);
          continue;
        }
        if (matchVaultFailure(line)) {
          clearSlot('pull');
          const components = activeRecipe?.components ?? [];
          // The reply can arrive after pullConfirmTimeoutMs (vault replies took 86-379 ms, median ~190, in the
          // player-log corpus), by which time the next get is already out. Candidates: every pull without a
          // success line yet.
          const firstUnconfirmed = Math.min(confirmedPulls, pullIndex);
          const candidates = components.slice(firstUnconfirmed, pullIndex + 1);
          const exact = candidates.length === 1;
          // A `put` for something not held is assumed to no-op harmlessly, so when the reply is ambiguous
          // put back everything that was asked for rather than guess.
          materialsHeld = exact
            ? components.slice(0, pullIndex + 1).filter((_, i) => i !== firstUnconfirmed)
            : components.slice(0, pullIndex + 1);
          const names = candidates.map((c) => `"${c.material}"`);
          enterError(
            api,
            cfg,
            exact
              ? `Vault is out of ${names[0]} — restock needed.`
              : `Vault is out of one of ${names.join(', ')} — restock needed (the reply came too late to tell which).`,
          );
          return;
        }
      }
      return;
    }

    if (state === 'checking_quality') {
      if (!qualityPending) return; // the lore reply was already consumed; this is a duplicate / stray line
      for (const line of lines) {
        const quality = matchItemCondition(line);
        if (quality != null) {
          clearSlot('quality');
          resolveOrderQuality(api, cfg, quality);
          return;
        }
      }
      return;
    }

    // state === 'crafting'
    // No craft in flight (pacing gap after an outcome, destroyed put-back chain): a second outcome,
    // interrupt or copyover line belongs to nothing and must not start another cycle.
    if (!outcomePending) return;
    let outcome: CraftOutcome = null;
    for (const line of lines) {
      if (outcome !== null) break; // success/failure already seen this payload — a later interrupted/vault-failure line here is stale noise, not a new event

      // A copyover (server hot-restart) silently drops whatever craft command
      // was in flight — no outcome line will ever arrive for it. Unlike an
      // interruption, this isn't the player's doing, so just redo the same
      // craft rather than stopping and asking them to resume manually. Only
      // the whole system line counts, and only once per craft attempt: a
      // repeated line must not stack another `craft` on the one already out.
      if (matchCopyoverRecovery(line)) {
        if (recraftsThisAttempt >= MAX_COPYOVER_RECRAFTS_PER_ATTEMPT) continue;
        clearSlot('craft');
        if (stopRequested) {
          goIdle(api, cfg);
          return;
        }
        recraftsThisAttempt += 1;
        writeInfo(api, `Copyover detected — recrafting "${activeRecipe?.outputName}".`);
        sendCraft(api, cfg, true);
        return;
      }

      // Something (a command, movement, being attacked) interrupted the
      // craft in progress — no outcome line will ever arrive, so stop
      // cleanly rather than wait forever or blindly re-craft.
      if (matchCraftInterrupted(line)) {
        clearAllTimers();
        const resumeCmd =
          mode === 'order'
            ? 'crafthelper order start'
            : `crafthelper improve ${activeCraftTypeRow?.verb ?? activeCraftTypeRow?.id ?? '<craftType>'} start`;
        writeInfo(api, `Crafting was interrupted ("You stop crafting.") — stopping. Run \`${resumeCmd}\` to resume.`);
        goIdle(api, cfg);
        return;
      }

      // A `get` that failed can be reported after pullConfirmTimeoutMs has
      // already elapsed (the pull step assumes silence means success), by
      // which point the craft command is out and we're in 'crafting'. That
      // late failure must still stop the script, not be ignored.
      if (matchVaultFailure(line)) {
        const needs = activeRecipe?.components.map((c) => `${c.material}:${c.qty}`).join(', ');
        enterError(
          api,
          cfg,
          `Vault ran out of components for "${activeRecipe?.outputName}" (needs ${needs}) — restock needed.`,
        );
        return;
      }

      const m = matchCraftOutcome(line);
      if (m) outcome = m;
    }

    if (outcome === null) return; // keep waiting for the craft-response timeout, or a recognized line

    clearSlot('craft');
    outcomePending = false; // consumed: until the next `craft` is sent, further outcome lines are ignored

    if (session) session.craftAttempts += 1;
    orderAttempts += 1;

    if (outcome === 'success') {
      consecutiveFailures = 0;
      if (session) session.successes += 1;
      recordMaterialsUsed(activeRecipe!.components);
      state = 'storing_trinket';
      materialsHeld = null; // consumed by the craft
      publishHud(api, cfg);
      handleCraftSuccess(api, cfg, activeRecipe!);
    } else if (outcome === 'failed_destroyed') {
      if (session) session.failedDestroyed += 1;
      recordMaterialsUsed(activeRecipe!.components);
      consecutiveFailures += 1;
      if (consecutiveFailures >= cfg.maxConsecutiveFailures) {
        enterError(api, cfg, failureBreakerMessage(consecutiveFailures));
        return;
      }
      beginDestroyedRecovery(api, cfg, activeRecipe!.components);
    } else {
      if (session) session.failedNoLoss += 1;
      consecutiveFailures += 1;
      if (stopRequested) {
        goIdle(api, cfg);
        return;
      }
      if (consecutiveFailures >= cfg.maxConsecutiveFailures) {
        enterError(api, cfg, failureBreakerMessage(consecutiveFailures));
        return;
      }
      if (orderBudgetExhausted(cfg)) {
        enterError(api, cfg, orderBudgetMessage());
        return;
      }
      schedule('pacing', cfg.commandPacingDelayMs, () => sendCraft(api, cfg));
    }
  }

  function failureBreakerMessage(failures: number): string {
    return `${failures} failed crafts in a row — stopped to protect vault materials. Check the tier / quality settings, then start again.`;
  }

  /** Order mode: the order has used its whole attempt allowance (quantity × maxAttemptsPerItem). */
  function orderBudgetExhausted(cfg: EngineConfig): boolean {
    return (
      mode === 'order' && activeOrder != null && orderAttempts >= activeOrder.quantityTotal * cfg.maxAttemptsPerItem
    );
  }

  function orderBudgetMessage(): string {
    return `Order ${activeOrder?.id}: too many attempts (${orderAttempts}) for ${activeOrder?.quantityTotal}x "${activeOrder?.itemName}" — stopped to protect vault materials. Check the quality spec, then \`crafthelper order start\` to continue.`;
  }

  function onScoreTimeout(api: PluginRuntimeApi) {
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
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

    // A closed connection or a different character ends the run: its timers would otherwise keep
    // firing `put`/`get`/`craft` into whatever session is attached next (a login prompt, another
    // character). Nothing is sent — the socket may be gone — held materials are only reported.
    const offClose = api.onEvent('game:remote-server:close', () => {
      if (state !== 'idle') resetEngine(api, 'Connection closed — run abandoned');
    });
    const offLogin = api.onEvent('game:character-login', () => {
      if (state !== 'idle') resetEngine(api, 'A character logged in — run abandoned');
    });

    // A failed localStorage write used to be swallowed: progress then silently reverted on reload and an
    // already-finished order was crafted again. Say so once.
    let storageErrorShown = false;
    const offStorageError = onStorageWriteError(() => {
      if (storageErrorShown) return;
      storageErrorShown = true;
      writeError(
        api,
        'Could not save crafting progress to browser storage (full or blocked) — it is held in memory only and will be lost on reload.',
      );
    });

    return () => {
      off();
      offClose();
      offLogin();
      offStorageError();
      // The host re-enables this same closure, so the engine must come back idle, not stuck mid-run.
      // Report only: nothing is sent while the plugin is being torn down.
      resetEngine(api, 'Crafting Helper disabled', false);
      if (lastPublishedSlot && api.setHudWidget) {
        api.setHudWidget(lastPublishedSlot, null);
        lastPublishedSlot = null;
      }
    };
  }

  function onAlias(api: PluginRuntimeApi, input: string): boolean | undefined {
    // "crh" is shorthand for "crafthelper" — normalize the leading token
    // once so every match below only has to know about the one prefix.
    const trimmed = input.trim().replace(/^crh(?=\s|$)/i, 'crafthelper');
    const lower = trimmed.toLowerCase();

    if (lower === 'crafthelper' || lower === 'crafthelper help') return handleHelp(api);
    const improveStartMatch = trimmed.match(/^crafthelper improve\s+(\S+)\s+start$/i);
    if (improveStartMatch) return handleImproveStart(api, improveStartMatch[1]);
    if (lower === 'crafthelper improve stop') return handleStop(api);
    if (lower === 'crafthelper improve status') return handleStatus(api);

    const addMatch = trimmed.match(/^crafthelper order add\s+(\d+)\s+'([^']+)'\s+(\S+)$/i);
    if (addMatch) return handleOrderAdd(api, addMatch);
    if (lower === 'crafthelper order list') return handleOrderList(api);
    const removeMatch = trimmed.match(/^crafthelper order remove\s+(\S+)$/i);
    if (removeMatch) return handleOrderRemove(api, removeMatch[1]);
    if (lower === 'crafthelper order start') return handleOrderStart(api);
    if (lower === 'crafthelper order stop') return handleStop(api);
    if (lower === 'crafthelper order status') return handleStatus(api);
    if (lower === 'crafthelper order history') return handleOrderHistory(api);
    const historyMatch = trimmed.match(/^crafthelper order history\s+(\S+)$/i);
    if (historyMatch) return handleOrderHistory(api, historyMatch[1]);

    return undefined;
  }

  function helpCmd(cmd: string, desc: string): string {
    const prefix = `  ${cmd}`;
    // A command longer than the padding column wraps the description onto
    // its own indented line instead of running the two together with no gap.
    if (prefix.length >= 42) return `${prefix}\n${' '.repeat(44)}${desc}`;
    return `${prefix.padEnd(44)}${desc}`;
  }

  function handleHelp(api: PluginRuntimeApi): boolean {
    api.writeTerminal(
      [
        `{C=== Crafting Helper v${PLUGIN_VERSION} ==={x`,
        'Automates tier-3 crafting. Two modes, one loop underneath:',
        '  {WImprove{x  — trains a craft skill: pulls the material(s) for the highest',
        '              trinket tier your skill qualifies for, crafts it, stores it in',
        '              the vault, and repeats — auto-escalating tiers as you level up.',
        '  {WOrder{x    — fulfills queued requests for finished items (gems, tailoring',
        '              goods, armor pieces, or full armor/cloth sets): pulls every named',
        '              component, crafts, checks quality via `lore`, and routes the',
        '              result by your spec.',
        'Stand wherever your vault and crafting station both are before starting either.',
        'If a craft never gets a recognized response within the Craft response',
        'timeout (default 180s, configurable), the run stops with a clear error',
        'instead of hanging indefinitely.',
        'Every command below also works with "crh" in place of "crafthelper".',
        '',
        '{Y-- Improving a skill --{x',
        helpCmd('crafthelper improve spellcraft start', 'start training Spellcrafting'),
        helpCmd('crafthelper improve tailor start', 'start training Tailoring'),
        helpCmd('crafthelper improve stop', 'finish the current step, then stop'),
        helpCmd('crafthelper improve status', 'show state, skill level, session stats'),
        '  (Craft type is either its verb, e.g. "spellcraft", or its config id, e.g.',
        '  "spellcrafting" — see the Craft types config for every craft type.)',
        '',
        '{Y-- Managing orders --{x',
        helpCmd("crafthelper order add 6 'diamond gem pain' 97+", 'queue 6, quality 97 or higher'),
        helpCmd("crafthelper order add 2 'silksteel cloth shirt' 95-98", 'queue 2, quality between 95 and 98'),
        helpCmd("crafthelper order add 1 'arcanium chainmail helmet' 99", 'queue 1, quality exactly 99'),
        helpCmd("crafthelper order add 2 'silksteel cloth set' 95+", 'queue 2 of each of the 6 cloth slots'),
        helpCmd("crafthelper order add 2 'arcanium chainmail set' 97+", 'queue 2 of each of the 6 chainmail slots'),
        helpCmd('crafthelper order list', 'list all queued orders'),
        helpCmd('crafthelper order remove <id>', 'remove a queued order by id'),
        helpCmd('crafthelper order start', 'start fulfilling the oldest queued order'),
        helpCmd('crafthelper order stop', 'finish the current step, then stop'),
        helpCmd('crafthelper order status', 'show the active order and queue depth'),
        helpCmd('crafthelper order history', 'list completed orders and materials used'),
        helpCmd('crafthelper order history <id>', 'show one completed order in full'),
        '',
        'Item names must match a known recipe (case-insensitive) — an unrecognized',
        'name is reported back so you can check spelling. A "set" name (any',
        'tailoring material or armor set + "cloth set" / "leather set" / "<armor',
        'set> set" — always ending in the word "set") queues one order per slot at',
        'once, all sharing the same quantity and quality spec. Adding your first',
        'order while idle with nothing else queued starts fulfillment right away —',
        'no separate `order start` needed (switch that off in the plugin settings).',
        '',
        "A queued order's id is generated from its item name and quality spec",
        '(e.g. "diamond-gem-pain-gte97-a1b2") so `order list`/`order remove <id>`/',
        '`order history <id>` are easy to read and match up at a glance.',
        '',
        'Every raw material pulled toward an order is tallied against it (a',
        '"destroyed" craft counts as a full loss of everything pulled for that',
        'attempt) and summarized when the order completes — see `order history`',
        'to look it up again later.',
        '',
        "A finished item's quality decides where it's stored: a range covered by the",
        'Quality → container map always wins, even if the item also satisfies the',
        "active order; otherwise it's the order holding container (in spec) or vault",
        '(off spec).',
        '',
        'Safety limits (defaults, adjustable in the plugin settings): a run stops',
        'itself after 15 failed crafts in a row, when an order has used 100 attempts',
        'per item, or if it would send more than 120 commands in 10 seconds. Quality',
        "is 0-100 and one order is 1-500 items. Only the game's own system lines",
        'drive a run: the same words typed by another player in chat are ignored.',
        'An order item counts only once the game confirms it was stored; if the game',
        'refuses the put or stays silent, the run stops and nothing is credited.',
        '{x',
      ].join('\n') + '\n',
    );
    return true;
  }

  /**
   * Resolves a typed craft-type token against either its id or its verb,
   * case-insensitively — `crafthelper improve spellcraft start` (the verb)
   * reads more naturally than the id ("spellcrafting"), so both work.
   */
  function resolveCraftType(cfg: EngineConfig, token: string): CraftTypeRow | null {
    const lower = token.toLowerCase();
    return cfg.craftTypes.find((t) => t.id === lower || t.verb.toLowerCase() === lower) ?? null;
  }

  // Lists every configured craft type as "id (verb)" — used to turn a typo'd
  // craft type into an immediately-actionable error instead of a dead end.
  function craftTypeOptionsText(cfg: EngineConfig): string {
    if (cfg.craftTypes.length === 0) return 'none configured — check the Craft types config';
    return cfg.craftTypes.map((t) => `"${t.id}" (${t.verb})`).join(', ');
  }

  // A single, mode-aware phrasing for "something is already running" —
  // names the mode and the exact stop command instead of a bare state enum.
  function alreadyRunningMessage(): string {
    const stopCmd = mode === 'order' ? 'crafthelper order stop' : 'crafthelper improve stop';
    return `Already running in ${mode} mode (state: ${state}) — run \`${stopCmd}\` first.`;
  }

  /** Fresh counters / guards for a new run, bound to the character that starts it. */
  function beginRun() {
    runKey = characterKey();
    outcomePending = false;
    qualityPending = false;
    pendingPut = null;
    recraftsThisAttempt = 0;
    consecutiveFailures = 0;
    orderAttempts = 0;
    confirmedPulls = 0;
    sentTimes = [];
    rateLimitTripped = false;
  }

  function handleImproveStart(api: PluginRuntimeApi, craftTypeToken: string): boolean {
    const cfg = readConfig(api);
    if (hasTimer('release')) {
      writeInfo(api, 'Still returning materials to the vault — try again in a moment.');
      return true;
    }
    if (state !== 'idle') {
      writeInfo(api, alreadyRunningMessage());
      return true;
    }
    if (characterKey() === '__unknown__') {
      writeError(
        api,
        'Character identity not yet known (no login data seen this session) — wait for the game to finish connecting, then retry. Storage is keyed by character, so starting now risks writing under the wrong name.',
      );
      return true;
    }

    const typeRow = resolveCraftType(cfg, craftTypeToken);
    if (!typeRow) {
      writeError(api, `Unknown craft type "${craftTypeToken}" — valid craft types: ${craftTypeOptionsText(cfg)}.`);
      return true;
    }

    mode = 'improve';
    activeCraftTypeRow = typeRow;
    stopRequested = false;
    stopReason = null;
    everRun = true;
    beginRun();
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
    trackedSkillLevel = getTrackedSkillLevel(characterKey(), typeRow.id);

    state = 'awaiting_score';
    publishHud(api, cfg);
    writeInfo(
      api,
      `Starting ${typeRow.label} training — make sure your character is parked wherever your vault and crafting station both are.`,
    );
    send(api, 'score');
    schedule('score', cfg.scoreResponseTimeoutMs, () => onScoreTimeout(api));
    return true;
  }

  function handleOrderAdd(api: PluginRuntimeApi, match: RegExpMatchArray): boolean {
    if (characterKey() === '__unknown__') {
      writeError(
        api,
        'Character identity not yet known (no login data seen this session) — wait for the game to finish connecting, then retry. Storage is keyed by character, so queuing now risks writing under the wrong name.',
      );
      return true;
    }
    const qty = parseInt(match[1], 10);
    const itemName = match[2].toLowerCase();
    const qualitySpec = parseQualitySpec(match[3]);

    if (!Number.isSafeInteger(qty) || qty < 1 || qty > MAX_ORDER_QTY) {
      writeError(api, `Invalid quantity "${match[1]}" — must be a whole number from 1 to ${MAX_ORDER_QTY}.`);
      return true;
    }
    if (!qualitySpec) {
      writeError(api, `Invalid quality spec "${match[3]}" — use "97+" (at least), "99" (exact), or "95-98" (range).`);
      return true;
    }

    // A "set" name (e.g. "silksteel cloth set", "arcanium chainmail set") fans
    // out into one queued order per member item, sharing this add's quantity
    // and quality spec — see ORDER_SET_RECIPES.
    const setItems = getOrderSetRecipe(itemName);
    const memberNames = setItems ?? [itemName];
    if (!setItems && !getOrderItemRecipe(itemName)) {
      writeError(
        api,
        `Unknown order item "${itemName}" — no recipe for it. Check spelling, or see \`crafthelper help\` for examples.`,
      );
      return true;
    }

    const cfg = readConfig(api);
    const queuedAlready = countOrders(characterKey());
    if (queuedAlready + memberNames.length > MAX_QUEUED_ORDERS) {
      writeError(
        api,
        `The order queue is full (${queuedAlready}/${MAX_QUEUED_ORDERS}) — remove or finish some orders first (\`crafthelper order list\`).`,
      );
      return true;
    }
    const wasEmpty = queuedAlready === 0;
    const queuedIds: string[] = [];

    memberNames.forEach((name) => {
      const orderRecipe = getOrderItemRecipe(name);
      if (!orderRecipe) {
        writeError(api, `Internal error: set member "${name}" has no recipe — skipped.`);
        return;
      }
      if (!cfg.craftTypes.find((t) => t.id === orderRecipe.craftTypeId)) {
        writeError(
          api,
          `Craft type "${orderRecipe.craftTypeId}" for "${name}" isn't configured — valid craft types: ${craftTypeOptionsText(cfg)}.`,
        );
        return;
      }
      const order: StoredCraftOrder = {
        id: makeOrderId(name, qualitySpec),
        itemName: name,
        quantityRemaining: qty,
        quantityTotal: qty,
        qualitySpec,
        createdAt: Date.now(),
        materialsUsed: {},
      };
      if (!addOrder(characterKey(), order)) {
        writeError(api, `Could not queue "${name}" — the order queue is full or the order was rejected as malformed.`);
        return;
      }
      queuedIds.push(order.id);
    });

    if (queuedIds.length === 0) {
      writeError(api, `No valid items queued for "${itemName}".`);
      return true;
    }

    if (setItems) {
      writeInfo(
        api,
        `Queued set "${itemName}": ${qty}x each of ${queuedIds.length} item(s) @ ${match[3]} (orders ${queuedIds.join(', ')}).`,
      );
    } else {
      writeInfo(api, `Queued order ${queuedIds[0]}: ${qty}x "${itemName}" @ ${match[3]}.`);
    }

    // Nothing else was queued or running — start fulfilling immediately
    // instead of leaving the player to remember `order start`. Turn it off with
    // the "Start orders as soon as one is added" setting.
    if (cfg.autoStartOnOrderAdd && wasEmpty && state === 'idle') {
      handleOrderStart(api);
    }

    return true;
  }

  /** Tells the player when saved orders were unreadable and dropped, instead of letting them vanish silently. */
  function reportDroppedOrders(api: PluginRuntimeApi) {
    const dropped = takeDroppedOrderCount(characterKey());
    if (dropped > 0) {
      writeError(
        api,
        `Ignored ${dropped} saved order(s) that could not be read (corrupt or from an incompatible version).`,
      );
    }
  }

  function handleOrderList(api: PluginRuntimeApi): boolean {
    reportDroppedOrders(api);
    const queue = getOrderQueue(characterKey());
    if (queue.length === 0) {
      writeInfo(api, 'No orders queued.');
      return true;
    }
    queue.forEach((o) => {
      const activeTag = o.id === activeOrder?.id && mode === 'order' && state !== 'idle' ? ' [active]' : '';
      writeInfo(api, `${o.id}: ${o.quantityRemaining}/${o.quantityTotal}x "${o.itemName}"${activeTag}`);
    });
    return true;
  }

  function handleOrderHistory(api: PluginRuntimeApi, orderId?: string): boolean {
    const history = getCompletedOrders(characterKey());
    if (history.length === 0) {
      writeInfo(api, 'No completed orders yet.');
      return true;
    }
    if (orderId) {
      const record = history.find((r) => r.id === orderId);
      if (!record) {
        writeError(
          api,
          `No completed order with id "${orderId}" — run \`crafthelper order history\` to see valid ids.`,
        );
        return true;
      }
      writeInfo(
        api,
        `${record.id}: ${record.quantityTotal}x "${record.itemName}" @ ${formatQualitySpec(record.qualitySpec)} — completed ${new Date(record.completedAt).toLocaleString()}.`,
      );
      writeInfo(api, `Materials used: ${formatMaterialsUsed(record.materialsUsed)}.`);
      return true;
    }
    for (const record of history) {
      writeInfo(
        api,
        `${record.id}: ${record.quantityTotal}x "${record.itemName}" @ ${formatQualitySpec(record.qualitySpec)} — ${formatMaterialsUsed(record.materialsUsed)}`,
      );
    }
    return true;
  }

  function handleOrderRemove(api: PluginRuntimeApi, orderId: string): boolean {
    const removed = removeOrder(characterKey(), orderId);
    if (!removed) {
      writeError(api, `No queued order with id "${orderId}" — run \`crafthelper order list\` to see valid ids.`);
      return true;
    }
    if (activeOrder?.id === orderId) {
      activeOrderRemoved = true;
    }
    writeInfo(api, `Removed order ${orderId}.`);
    return true;
  }

  function handleOrderStart(api: PluginRuntimeApi): boolean {
    if (hasTimer('release')) {
      writeInfo(api, 'Still returning materials to the vault — try again in a moment.');
      return true;
    }
    if (state !== 'idle') {
      writeInfo(api, alreadyRunningMessage());
      return true;
    }
    if (characterKey() === '__unknown__') {
      writeError(
        api,
        'Character identity not yet known (no login data seen this session) — wait for the game to finish connecting, then retry. Storage is keyed by character, so starting now risks writing under the wrong name.',
      );
      return true;
    }
    reportDroppedOrders(api);
    const queue = getOrderQueue(characterKey());
    if (queue.length === 0) {
      writeInfo(api, 'No orders queued.');
      return true;
    }

    mode = 'order';
    trackedSkillLevel = null; // any level from an earlier improve run may belong to a different craft
    stopRequested = false;
    stopReason = null;
    everRun = true;
    beginRun();
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
    const parts = [`state=${state}`, `mode=${mode}`];

    if (mode === 'order') {
      parts.push(
        `activeOrder=${activeOrder ? `${activeOrder.quantityRemaining}/${activeOrder.quantityTotal}x "${activeOrder.itemName}"` : 'none'}`,
        `queueDepth=${countOrders(characterKey())}`,
      );
    } else {
      parts.push(`craftType=${activeCraftTypeRow?.label ?? '?'}`, `skill=${trackedSkillLevel ?? '?'}`);
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
      version: PLUGIN_VERSION,
      description:
        'Automates tier-3 crafting: skill-up training (auto-escalating trinket tiers as your skill rises) and bulk order fulfillment (multi-component items, checked by quality and tracked to completion). Run `crafthelper help` (or `crh help`) in-game for full command syntax, examples, and behavior notes.',
    },

    configSchema: {
      defaults: {
        craftTypes: DEFAULT_CRAFT_TYPES_CONFIG,
        tierTable: DEFAULT_TIER_TABLE_CONFIG,
        commandPacingDelayMs: 150,
        pullConfirmTimeoutMs: 200,
        scoreResponseTimeoutMs: 1000,
        loreResponseTimeoutMs: 2000,
        craftResponseTimeoutMs: 180000,
        orderHoldingContainer: 'vault',
        qualityContainerMap: '',
        debug: false,
        hudSlot: 'hud.bottomStrip',
        autoStartOnOrderAdd: true,
        maxConsecutiveFailures: 15,
        maxAttemptsPerItem: 100,
        maxCommandsPerWindow: 120,
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
          key: 'commandPacingDelayMs',
          type: 'number',
          label: 'Command pacing delay (ms)',
          min: 50,
          max: 5000,
          description:
            'Delay between sequential commands (after a put, and between repeat craft attempts). 50-5000; out-of-range values use the default.',
        },
        {
          key: 'pullConfirmTimeoutMs',
          type: 'number',
          label: 'Pull confirm timeout (ms)',
          min: 50,
          max: 10000,
          description:
            'How long to wait after `get` for a vault-failure message before assuming the pull succeeded. 50-10000.',
        },
        {
          key: 'scoreResponseTimeoutMs',
          type: 'number',
          label: 'Score response timeout (ms)',
          min: 100,
          max: 60000,
          description:
            'How long to wait after `score` for the matching craft-rank line before aborting start. 100-60000.',
        },
        {
          key: 'loreResponseTimeoutMs',
          type: 'number',
          label: 'Lore response timeout (ms)',
          min: 100,
          max: 60000,
          description:
            "How long to wait after `lore` for the item's Condition line, and then for the game to confirm the item was stored, before aborting (order mode only). 100-60000.",
        },
        {
          key: 'craftResponseTimeoutMs',
          type: 'number',
          label: 'Craft response timeout (ms)',
          min: 100,
          max: ONE_HOUR_MS,
          description:
            'How long to wait after `craft` for a recognized outcome line before stopping — a safety net in case the server ever sends unrecognized text (default 180s; a craft can take up to ~2.5 ticks on higher tiers, so keep this generous). 0 or empty does not mean "never": out-of-range values use the default.',
        },
        {
          key: 'orderHoldingContainer',
          type: 'string',
          label: 'Order holding container',
          description:
            "Where a finished, in-spec order item is stored, ready for manual hand-off — used when its quality isn't covered by the map below.",
          placeholder: 'vault',
        },
        {
          key: 'qualityContainerMap',
          type: 'textarea',
          label: 'Quality → container map',
          description:
            'One row per quality range: "<range or single value> | <container>". A mapped quality always routes here, even for an item that also satisfies the active order — order credit still depends only on satisfying the spec, not on the container. Unmapped qualities go to the order holding container (in spec) or vault (off spec).',
          placeholder: '90-94 | common',
        },
        {
          key: 'autoStartOnOrderAdd',
          type: 'boolean',
          label: 'Start orders as soon as one is added',
          description:
            'When on (default), `crafthelper order add` on an empty queue begins fulfilling it immediately. Turn off to queue orders and start them yourself with `crafthelper order start`.',
        },
        {
          key: 'maxConsecutiveFailures',
          type: 'number',
          label: 'Stop after N failed crafts in a row',
          min: 1,
          max: 10000,
          description:
            'Safety brake: a run that fails this many times in a row stops instead of burning more vault materials (default 15).',
        },
        {
          key: 'maxAttemptsPerItem',
          type: 'number',
          label: 'Order attempt limit (per item)',
          min: 1,
          max: 10000,
          description:
            'Safety brake: an order stops once its crafts reach quantity x this number (default 100) — catches a quality spec that can never be met.',
        },
        {
          key: 'maxCommandsPerWindow',
          type: 'number',
          label: 'Command rate limit (per 10 s)',
          min: 20,
          max: 1000,
          description:
            'Safety brake: the plugin stops itself if it would send more than this many commands in 10 seconds (default 120).',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Log every command the plugin sends (and any skill-up line it ignores) to the plugin log.',
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
