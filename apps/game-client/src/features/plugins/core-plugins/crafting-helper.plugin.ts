// apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts
import type { IPluginModule, PluginRuntimeApi, HudSlotId, HudWidgetContent } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';
import { getTrackedSkillLevel, setTrackedSkillLevel } from './crafting-helper-storage';

/**
 * Crafting Helper — automates tier-3 crafting skill-up training.
 *
 * Config-driven across craft skills (verb, score-rank keyword, and tier
 * table are all data, not code) — ships seeded with Spellcrafting only.
 * A character trains one craft skill at a time via `activeCraftType`.
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

export interface CraftTierRow {
  craftTypeId: string;
  skillThreshold: number;
  trinket: string;
  material: string;
  materialQty: number;
}

export type EngineState =
  | 'idle'
  | 'awaiting_score'
  | 'pulling_material'
  | 'crafting'
  | 'storing_trinket'
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
  'spellcrafting | Spellcrafting | spellcraft | Spellcrafter',
].join('\n');

export const DEFAULT_TIER_TABLE_CONFIG = [
  '# <craftTypeId> | <skill threshold> | <trinket> | <raw material> | <qty, optional, default 1>',
  'spellcrafting | 1   | obsidian gemstone | uncut obsidian stone',
  'spellcrafting | 121 | moonstone         | uncut moonstone',
  'spellcrafting | 241 | opal gemstone     | uncut opal stone',
  'spellcrafting | 361 | amethyst gemstone | uncut amethyst stone',
  'spellcrafting | 481 | emerald gemstone  | uncut emerald stone',
  'spellcrafting | 601 | sapphire gemstone | uncut sapphire stone',
  'spellcrafting | 721 | ruby gemstone     | uncut ruby stone',
  'spellcrafting | 841 | diamond gemstone  | uncut diamond stone',
].join('\n');

function splitConfigLines(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
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
    const [craftTypeId, thresholdStr, trinket, material, qtyStr] = parts;
    const skillThreshold = parseInt(thresholdStr, 10);
    if (!craftTypeId || !trinket || !material || !Number.isFinite(skillThreshold)) continue;
    const parsedQty = qtyStr ? parseInt(qtyStr, 10) : 1;
    const materialQty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
    rows.push({ craftTypeId: craftTypeId.toLowerCase(), skillThreshold, trinket, material, materialQty });
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

// ── HUD content ───────────────────────────────────────────────────────

function phaseLabel(state: EngineState): string {
  switch (state) {
    case 'awaiting_score':
      return 'checking score';
    case 'pulling_material':
      return 'pulling material';
    case 'crafting':
      return 'crafting';
    case 'storing_trinket':
      return 'storing trinket';
    default:
      return state;
  }
}

export function buildHudContent(input: {
  state: EngineState;
  everRun: boolean;
  trackedSkillLevel: number | null;
  activeTrinket: string | null;
  stopReason: string | null;
}): HudWidgetContent | null {
  const { state, everRun, trackedSkillLevel, activeTrinket, stopReason } = input;

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
    value: `Lv ${trackedSkillLevel ?? '?'} · ${activeTrinket ?? '?'} · ${phaseLabel(state)}`,
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
  craftResponseTimeoutMs: number;
  scoreResponseTimeoutMs: number;
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
    commandPacingDelayMs: numOr(cfg.commandPacingDelayMs, 800),
    pullConfirmTimeoutMs: numOr(cfg.pullConfirmTimeoutMs, 2500),
    craftResponseTimeoutMs: numOr(cfg.craftResponseTimeoutMs, 5000),
    scoreResponseTimeoutMs: numOr(cfg.scoreResponseTimeoutMs, 5000),
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
  let activeRecipe: CraftTierRow | null = null;
  let session: SessionStats | null = null;

  let scoreTimer: ReturnType<typeof setTimeout> | null = null;
  let pullTimer: ReturnType<typeof setTimeout> | null = null;
  let craftTimer: ReturnType<typeof setTimeout> | null = null;
  let pacingTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPublishedSlot: HudSlotId | null = null;

  function clearAllTimers() {
    if (scoreTimer) clearTimeout(scoreTimer);
    if (pullTimer) clearTimeout(pullTimer);
    if (craftTimer) clearTimeout(craftTimer);
    if (pacingTimer) clearTimeout(pacingTimer);
    scoreTimer = pullTimer = craftTimer = pacingTimer = null;
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
      activeTrinket: activeRecipe?.trinket ?? null,
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

  // ── resolveNextRecipe — improve-mode seam ───────────────────────────
  // Order mode (future) needs a second implementation here: pick the next
  // open order's exact item (its own multi-stage recipe) instead of
  // auto-escalating to the highest qualified tier.
  function resolveNextRecipe(cfg: EngineConfig): CraftTierRow | null {
    if (trackedSkillLevel == null) return null;
    return tierForSkill(cfg.activeCraftType, trackedSkillLevel, cfg.tierTable);
  }

  // ── handleCraftSuccess — improve-mode seam ──────────────────────────
  // Order mode (future) needs a second implementation here: lore the item,
  // parse its quality %, and route it to an order or a quality→container
  // map instead of unconditionally storing to vault.
  function handleCraftSuccess(api: PluginRuntimeApi, recipe: CraftTierRow) {
    api.sendCommand(`put 1 '${recipe.trinket}' vault`);
  }

  function goIdle(api: PluginRuntimeApi, cfg: EngineConfig) {
    stopRequested = false;
    state = 'idle';
    activeRecipe = null;
    publishHud(api, cfg);
    writeInfo(api, 'Stopped.');
  }

  function enterError(api: PluginRuntimeApi, cfg: EngineConfig, reason: string) {
    clearAllTimers();
    state = 'error_stopped';
    stopReason = reason;
    publishHud(api, cfg);
    writeError(api, reason);
  }

  function beginPullCycle(api: PluginRuntimeApi) {
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }

    const recipe = resolveNextRecipe(cfg);
    if (!recipe) {
      enterError(api, cfg, `Skill level ${trackedSkillLevel} has no matching tier in the tier table.`);
      return;
    }

    activeRecipe = recipe;
    state = 'pulling_material';
    publishHud(api, cfg);
    api.sendCommand(`get ${recipe.materialQty} '${recipe.material}' vault`);
    pullTimer = setTimeout(() => onPullTimeout(api), cfg.pullConfirmTimeoutMs);
  }

  function onPullTimeout(api: PluginRuntimeApi) {
    pullTimer = null;
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    sendCraft(api, cfg);
  }

  function sendCraft(api: PluginRuntimeApi, cfg: EngineConfig) {
    if (!activeCraftTypeRow || !activeRecipe) {
      enterError(api, cfg, 'Internal error: no active craft type/recipe.');
      return;
    }
    state = 'crafting';
    publishHud(api, cfg);
    api.sendCommand(`craft ${activeCraftTypeRow.verb} '${activeRecipe.trinket}'`);
    craftTimer = setTimeout(() => onCraftTimeout(api), cfg.craftResponseTimeoutMs);
  }

  function onCraftTimeout(api: PluginRuntimeApi) {
    craftTimer = null;
    const cfg = readConfig(api);
    enterError(
      api,
      cfg,
      `No success/failure line seen within ${cfg.craftResponseTimeoutMs}ms after crafting — stopped to avoid looping on unrecognized text.`,
    );
  }

  function handleRawData(api: PluginRuntimeApi, rawText: string) {
    // Every line of game output flows through here — bail immediately unless
    // we're mid-cycle, so idle/stopped/storing sit at effectively zero cost.
    if (state !== 'awaiting_score' && state !== 'pulling_material' && state !== 'crafting') return;

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

    if (state === 'pulling_material') {
      for (const rawLine of plain.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (matchVaultFailure(line)) {
          if (pullTimer) {
            clearTimeout(pullTimer);
            pullTimer = null;
          }
          enterError(api, cfg, `Vault is out of "${activeRecipe?.material}" — restock needed.`);
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

      const improved = matchSkillImproved(line);
      if (improved != null) {
        trackedSkillLevel = improved;
        setTrackedSkillLevel(characterKey(), cfg.activeCraftType, improved);
        if (session) session.skillGains += 1;
        publishHud(api, cfg);
      }

      if (outcome === null) {
        const m = matchCraftOutcome(line);
        if (m) outcome = m;
      }
    }

    if (outcome === null) return; // keep waiting; craftTimer covers a real stall

    if (craftTimer) {
      clearTimeout(craftTimer);
      craftTimer = null;
    }
    if (session) session.craftAttempts += 1;

    if (outcome === 'success') {
      if (session) session.successes += 1;
      state = 'storing_trinket';
      publishHud(api, cfg);
      handleCraftSuccess(api, activeRecipe!);
      pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
    } else if (outcome === 'failed_destroyed') {
      if (session) session.failedDestroyed += 1;
      pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
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
    const trimmed = input.trim().toLowerCase();
    if (trimmed !== 'crafthelper start' && trimmed !== 'crafthelper stop' && trimmed !== 'crafthelper status') {
      return undefined;
    }

    const cfg = readConfig(api);

    if (trimmed === 'crafthelper start') {
      if (state !== 'idle') {
        writeInfo(api, `Already running (state: ${state}).`);
        return true;
      }

      const typeRow = cfg.craftTypes.find((t) => t.id === cfg.activeCraftType);
      if (!typeRow) {
        writeError(api, `Unknown active craft type "${cfg.activeCraftType}" — check the Craft types config.`);
        return true;
      }

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

    if (trimmed === 'crafthelper stop') {
      if (state === 'idle') {
        writeInfo(api, 'Not running.');
        return true;
      }
      stopRequested = true;
      writeInfo(api, 'Stop requested — finishing current step, then going idle.');
      return true;
    }

    // crafthelper status
    const parts = [
      `state=${state}`,
      `craftType=${activeCraftTypeRow?.label ?? cfg.activeCraftType}`,
      `skill=${trackedSkillLevel ?? '?'}`,
      `trinket=${activeRecipe?.trinket ?? '?'}`,
    ];
    if (session) {
      parts.push(
        `attempts=${session.craftAttempts}`,
        `success=${session.successes}`,
        `destroyed=${session.failedDestroyed}`,
        `noLoss=${session.failedNoLoss}`,
        `skillGains=${session.skillGains}`,
      );
    }
    if (state === 'error_stopped' && stopReason) parts.push(`reason=${stopReason}`);
    writeInfo(api, parts.join('  '));
    return true;
  }

  return {
    manifest: {
      id: 'crafting-helper',
      name: 'Crafting Helper',
      version: '0.1.0',
      description:
        "Automates tier-3 crafting skill-up training: pulls raw materials from the vault, crafts the highest tier your current skill qualifies for, and stores finished trinkets. Ships seeded with Spellcrafting; other craft skills can be added via config once their command syntax is known. Run this while standing wherever your vault and crafting station both are. Commands: crafthelper start / stop / status.",
    },

    configSchema: {
      defaults: {
        craftTypes: DEFAULT_CRAFT_TYPES_CONFIG,
        tierTable: DEFAULT_TIER_TABLE_CONFIG,
        activeCraftType: 'spellcrafting',
        commandPacingDelayMs: 800,
        pullConfirmTimeoutMs: 2500,
        craftResponseTimeoutMs: 5000,
        scoreResponseTimeoutMs: 5000,
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
            'One row per trinket: "<craftTypeId> | <skill threshold> | <trinket name> | <raw material name> | <qty, optional>". The highest tier you currently qualify for is always used.',
          placeholder: 'spellcrafting | 1 | obsidian gemstone | uncut obsidian stone',
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
          key: 'craftResponseTimeoutMs',
          type: 'number',
          label: 'Craft response timeout (ms)',
          min: 0,
          description: 'How long to wait after `craft` for a success/failure line before stopping with an error.',
        },
        {
          key: 'scoreResponseTimeoutMs',
          type: 'number',
          label: 'Score response timeout (ms)',
          min: 0,
          description: 'How long to wait after `score` for the matching craft-rank line before aborting start.',
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
