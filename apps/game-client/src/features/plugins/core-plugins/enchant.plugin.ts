// apps\game-client\src\features\plugins\core-plugins\enchant.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';

/**
 * Enchant Helper — automates the enchanting loop.
 *
 * Item list (config textarea): one item per line.
 *   <item name> | <weapon|armor>
 *
 * Examples:
 *   fancy sword | weapon
 *   dragon helm | armor
 *
 * Container: the bag to get items from.
 * Storage:   where to put finished items before fetching the next (optional).
 * Target level: auto-enchant goal per session (0 = cast once/manually).
 *               Weapon max meaningful level is +3/+3, armor is -3.
 *
 * Aliases (type in the command bar):
 *   enchant start [name]   — set active item (name optional if only one configured) and cast enchant.
 *   enchant stop           — halt auto loop.
 *   enchant get [name]     — put current item in storage, fetch named (or active) item from container.
 *   enchant restore        — cast restore on active item.
 *   enchant disenchant     — cast disenchant on active item.
 *   enchant identify       — cast identify on active item.
 *   enchant reset          — reset tracked level to 0.
 *   enchant set <n>        — manually override tracked level.
 *   enchant show           — print current state to terminal.
 */

// ── Types ──────────────────────────────────────────────────────────────────

type ItemType = 'weapon' | 'armor';

interface EnchantItem {
  name: string;
  type: ItemType;
}

type EnchantOutcome =
  | { kind: 'enchanted'; delta: number }
  | { kind: 'faded' }
  | { kind: 'destroyed' }
  | { kind: 'nothing' };

// ── Trigger phrases ────────────────────────────────────────────────────────
// Ordered longest-first so more specific phrases match before sub-strings.

const TRIGGER_PHRASES: Array<{ pattern: string; outcome: EnchantOutcome }> = [
  { pattern: 'glows a brilliant white',                     outcome: { kind: 'enchanted', delta: 3 } },
  { pattern: 'glows a brilliant blue',                      outcome: { kind: 'enchanted', delta: 2 } },
  { pattern: 'glows a brilliant gold',                      outcome: { kind: 'enchanted', delta: 2 } },
  { pattern: 'glows blue',                                  outcome: { kind: 'enchanted', delta: 1 } },
  { pattern: 'shimmers with a gold aura',                   outcome: { kind: 'enchanted', delta: 1 } },
  { pattern: 'glows brightly, then fades...oops',           outcome: { kind: 'faded' } },
  { pattern: 'glows brightly, then fades to a dull color',  outcome: { kind: 'faded' } },
  { pattern: "restored to it's original form",              outcome: { kind: 'faded' } },
  { pattern: 'shivers violently and explodes',              outcome: { kind: 'destroyed' } },
  { pattern: 'crumbles into dust',                          outcome: { kind: 'destroyed' } },
  { pattern: 'flares blindingly... and evaporates',         outcome: { kind: 'destroyed' } },
  { pattern: 'Nothing seemed to happen',                    outcome: { kind: 'nothing' } },
];

function matchTrigger(plain: string): EnchantOutcome | null {
  for (const t of TRIGGER_PHRASES) {
    if (plain.includes(t.pattern)) return t.outcome;
  }
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseItemList(raw: unknown): EnchantItem[] {
  if (typeof raw !== 'string') return [];
  const items: EnchantItem[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const pipeIdx = trimmed.indexOf('|');
    if (pipeIdx === -1) continue;
    const name = trimmed.slice(0, pipeIdx).trim();
    const typeRaw = trimmed.slice(pipeIdx + 1).trim().toLowerCase();
    if (!name) continue;
    items.push({ name, type: typeRaw === 'weapon' ? 'weapon' : 'armor' });
  }
  return items;
}

function formatLevel(level: number, type: ItemType): string {
  if (level === -1) return 'DESTROYED';
  if (type === 'weapon') return `+${level}/+${level}`;
  return level === 0 ? '0' : `-${level}`;
}

// ── Default config ─────────────────────────────────────────────────────────

export const DEFAULT_ITEM_LIST = [
  '# Format: item name | weapon or armor',
  '#',
  '# fancy sword | weapon',
  '# dragon helm | armor',
].join('\n');

// ── Plugin factory ─────────────────────────────────────────────────────────

export function createEnchantPlugin(): IPluginModule {
  // State is scoped to the plugin instance — shared between onEnable and onAlias.
  // Reset when the plugin is disabled (onEnable cleanup).
  let activeItem: EnchantItem | null = null;
  let currentLevel = 0;
  let enchanting = false;
  let apiRef: PluginRuntimeApi | null = null;

  // ── Shared logic ─────────────────────────────────────────────────────────

  function castOnItem(api: PluginRuntimeApi, spell: string): void {
    if (!activeItem) {
      api.log('No active item. Use: enchant start <item name>');
      return;
    }
    const fullSpell =
      spell === 'identify' || spell === 'disenchant'
        ? spell
        : `${spell} ${activeItem.type}`;
    api.sendCommand(`cast '${fullSpell}' '${activeItem.name}'`);
  }

  function showState(api: PluginRuntimeApi): void {
    if (!activeItem) {
      api.log('No active item. Use: enchant start <item name>');
      return;
    }
    const cfg = api.getConfig();
    const target = Number(cfg.targetLevel ?? 0);
    api.log(
      `${activeItem.name} (${activeItem.type}) — level: ${formatLevel(currentLevel, activeItem.type)}` +
        (target > 0 ? ` — target: ${target}` : '') +
        (enchanting ? ' — AUTO ON' : ''),
    );
  }

  function applyOutcome(api: PluginRuntimeApi, outcome: EnchantOutcome): void {
    if (!activeItem) return;
    const cfg = api.getConfig();
    const debug = cfg.debug === true;
    const target = Number(cfg.targetLevel ?? 0);

    switch (outcome.kind) {
      case 'enchanted':
        currentLevel = currentLevel + outcome.delta;
        if (debug) api.log(`enchanted → ${formatLevel(currentLevel, activeItem.type)}`);
        break;

      case 'faded':
        currentLevel = 0;
        enchanting = false;
        api.log(`${activeItem.name} faded — level reset to 0.`);
        return;

      case 'destroyed':
        currentLevel = -1;
        enchanting = false;
        api.log(`{R${activeItem.name} was DESTROYED!{x`);
        return;

      case 'nothing':
        if (debug) api.log('nothing happened');
        break;
    }

    if (enchanting && target > 0 && currentLevel < target) {
      castOnItem(api, 'enchant');
    } else if (enchanting && target > 0 && currentLevel >= target) {
      enchanting = false;
      api.log(`${activeItem.name} reached target: ${formatLevel(currentLevel, activeItem.type)}.`);
    }
  }

  // ── onEnable ──────────────────────────────────────────────────────────────

  function onEnable(api: PluginRuntimeApi): () => void {
    apiRef = api;

    const offRaw = api.onEvent('shatteredarchive:raw-data', (payload: any) => {
      if (!activeItem) return;

      const rawText = String(payload?.rawText ?? payload?.text ?? '');
      if (!rawText) return;

      const plain = stripAnsi(rawText);
      const outcome = matchTrigger(plain);
      if (!outcome) return;

      // "Nothing seemed to happen" is a global catch-all;
      // all other outcomes require the item name to appear on the line.
      if (outcome.kind !== 'nothing' && !plain.toLowerCase().includes(activeItem.name.toLowerCase())) return;

      if (api.getConfig().debug) api.log(`trigger: ${outcome.kind} — "${plain.trim()}"`);

      applyOutcome(api, outcome);
    });

    return () => {
      offRaw();
      // Reset volatile state on disable; config persists separately.
      activeItem = null;
      currentLevel = 0;
      enchanting = false;
      apiRef = null;
    };
  }

  // ── onAlias ───────────────────────────────────────────────────────────────

  function onAlias(api: PluginRuntimeApi, input: string): boolean | undefined {
    const trimmed = input.trim();
    if (!/^enchant\b/i.test(trimmed)) return false;

    // enchant start [name]
    const startMatch = trimmed.match(/^enchant\s+start(?:\s+(.+))?$/i);
    if (startMatch) {
      const cfg = api.getConfig();
      const items = parseItemList(cfg.items);
      const namePart = startMatch[1]?.trim().toLowerCase();

      let target: EnchantItem | null = null;
      if (namePart) {
        target = items.find((i) => i.name.toLowerCase() === namePart) ?? null;
        if (!target) {
          api.log(`No configured item matching "${startMatch[1]}". Check the Configure panel.`);
          return true;
        }
      } else if (items.length === 1) {
        target = items[0];
      } else if (items.length === 0) {
        api.log('No items configured. Add items in the Configure panel.');
        return true;
      } else {
        api.log('Multiple items configured — specify one: enchant start <name>');
        for (const i of items) api.log(`  ${i.name} (${i.type})`);
        return true;
      }

      if (activeItem?.name !== target.name) {
        currentLevel = 0;
      }
      activeItem = target;
      enchanting = true;
      showState(api);
      castOnItem(api, 'enchant');
      return true;
    }

    // enchant stop
    if (/^enchant\s+stop$/i.test(trimmed)) {
      enchanting = false;
      api.log('Stopped.');
      return true;
    }

    // enchant get [name]
    const getMatch = trimmed.match(/^enchant\s+get(?:\s+(.+))?$/i);
    if (getMatch) {
      const cfg = api.getConfig();
      const items = parseItemList(cfg.items);
      const namePart = getMatch[1]?.trim().toLowerCase();
      const container = typeof cfg.container === 'string' && cfg.container.trim() ? cfg.container.trim() : 'bag';
      const storage = typeof cfg.storage === 'string' ? cfg.storage.trim() : '';

      let target: EnchantItem | null = null;
      if (namePart) {
        target = items.find((i) => i.name.toLowerCase() === namePart) ?? null;
      } else {
        target = activeItem ?? (items.length === 1 ? items[0] : null);
      }

      if (!target) {
        api.log('No item specified. Use: enchant get <name>');
        return true;
      }

      if (activeItem && storage && currentLevel !== -1) {
        api.sendCommand(`put '${activeItem.name}' '${storage}'`);
      }
      api.sendCommand(`get '${target.name}' '${container}'`);

      if (activeItem?.name !== target.name) currentLevel = 0;
      activeItem = target;
      enchanting = false;
      return true;
    }

    // enchant restore
    if (/^enchant\s+restore$/i.test(trimmed)) { castOnItem(api, 'restore'); return true; }

    // enchant disenchant
    if (/^enchant\s+disenchant$/i.test(trimmed)) { castOnItem(api, 'disenchant'); return true; }

    // enchant identify
    if (/^enchant\s+identify$/i.test(trimmed)) { castOnItem(api, 'identify'); return true; }

    // enchant reset
    if (/^enchant\s+reset$/i.test(trimmed)) {
      currentLevel = 0;
      enchanting = false;
      api.log('Level reset to 0.');
      return true;
    }

    // enchant set <n>
    const setMatch = trimmed.match(/^enchant\s+set\s+(-?\d+)$/i);
    if (setMatch) {
      currentLevel = parseInt(setMatch[1], 10);
      api.log(`Level set to ${currentLevel}.`);
      return true;
    }

    // enchant show
    if (/^enchant\s+show$/i.test(trimmed)) {
      showState(api);
      return true;
    }

    return false;
  }

  return {
    manifest: {
      id: 'enchant',
      name: 'Enchant Helper',
      version: '0.1.0',
      description:
        'Automates the enchanting loop. Tracks enchant level, auto-continues to target, handles fades and explosions.',
    },

    configSchema: {
      defaults: {
        items: DEFAULT_ITEM_LIST,
        container: 'bag',
        storage: '',
        targetLevel: 0,
        debug: false,
      },
      fields: [
        {
          key: 'items',
          type: 'textarea',
          label: 'Items to enchant',
          description:
            'One item per line: item name | weapon or armor. Lines starting with # are comments.',
          placeholder: 'fancy sword | weapon\ndragon helm | armor',
        },
        {
          key: 'container',
          type: 'string',
          label: 'Container (source)',
          description: 'Bag or container to get items from.',
          placeholder: 'bag',
        },
        {
          key: 'storage',
          type: 'string',
          label: 'Storage (destination)',
          description: 'Where to put finished items before fetching the next. Leave blank to skip.',
          placeholder: 'vault',
          optional: true,
        },
        {
          key: 'targetLevel',
          type: 'number',
          label: 'Auto-enchant target level',
          description:
            'Keep casting until this level is reached (max 3). Set to 0 to cast once per command.',
          min: 0,
          max: 3,
          step: 1,
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Logs trigger matches and state transitions.',
        },
      ],
    },

    onEnable,
    onAlias,
  };
}
