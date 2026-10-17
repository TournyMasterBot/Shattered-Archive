// apps/game-client/src/features/plugins/core-plugins/crafting-helper.test-harness.ts
//
// Shared mock runtime and scenario helpers for the Crafting Helper test suites
// (plugin, hardening, hardening-units). Extracted from crafting-helper.plugin.test.ts so the
// suites drive the same state machine without a second copy of the mock. Not a test file itself
// (no .test. in the name), so jest does not collect it.
import type { HudWidgetContent, PluginRuntimeApi } from '@shatteredarchive/types-client';
import {
  createCraftingHelperPlugin,
  DEFAULT_CRAFT_TYPES_CONFIG,
  DEFAULT_TIER_TABLE_CONFIG,
} from './crafting-helper.plugin';
import type { StoredCraftOrder } from './crafting-helper-storage';

type Handler = (payload: unknown) => void;

export function createMockApi(config: Record<string, unknown>) {
  const sent: string[] = [];
  const terminalWrites: string[] = [];
  const hudWrites: Array<{ slotId: string; content: HudWidgetContent | null }> = [];
  const logs: unknown[][] = [];
  const handlers = new Map<string, Set<Handler>>();

  const api: PluginRuntimeApi = {
    connectionId: 'test-conn',
    pluginId: 'crafting-helper',
    sendCommand: (cmd: string) => sent.push(cmd),
    log: (...args: unknown[]) => logs.push(args),
    error: () => {},
    onEvent: (eventName: string, handler: Handler) => {
      if (!handlers.has(eventName)) handlers.set(eventName, new Set());
      handlers.get(eventName)!.add(handler);
      return () => {
        handlers.get(eventName)?.delete(handler);
      };
    },
    httpGetJson: async () => ({}),
    getConfig: () => config,
    setConfig: () => {},
    updateConfig: (patch: Record<string, unknown>) => Object.assign(config, patch),
    writeTerminal: (dslText: string) => terminalWrites.push(dslText),
    registerAction: () => {},
    registerOmitRules: () => {},
    setHudWidget: (slotId, content) => {
      hudWrites.push({ slotId, content });
    },
  };

  const emit = (eventName: string, payload: unknown) => {
    for (const h of [...(handlers.get(eventName) ?? [])]) h(payload);
  };

  return {
    api,
    sent,
    terminalWrites,
    hudWrites,
    logs,
    /** Fire any event the plugin subscribed to (raw-data, remote-server:close, character-login, ...). */
    emit,
    listenerCount: (eventName: string) => handlers.get(eventName)?.size ?? 0,
    feedLine: (line: string) => emit('shatteredarchive:raw-data', { rawText: `${line}\r\n` }),
    feedRaw: (rawText: string) => emit('shatteredarchive:raw-data', { rawText }),
  };
}

export function defaultConfig(overrides: Record<string, unknown> = {}) {
  return {
    craftTypes: DEFAULT_CRAFT_TYPES_CONFIG,
    tierTable: DEFAULT_TIER_TABLE_CONFIG,
    commandPacingDelayMs: 100,
    pullConfirmTimeoutMs: 200,
    scoreResponseTimeoutMs: 200,
    debug: false,
    hudSlot: 'hud.bottomStrip',
    ...overrides,
  };
}

// ── scenario helpers (hardening suites) ─────────────────────────────────

/** The exact system lines the plugin reacts to. */
export const SYS = {
  success: 'You were successful.',
  destroyed: 'You failed and destroyed some materials in the process.',
  noLoss: 'You failed but did not lose any materials.',
  interrupted: 'You stop crafting.',
  vaultFailure: 'I see nothing like that in the vault.',
  copyover: 'Copyover recovery complete.',
  // Corpus shapes of the server's reply to `put`.
  putOk: 'You put a diamond gem pain in the mystic vault.',
  putRefused: 'You do not have that item.',
} as const;

export const SCORE_SPELL_948 = 'Craftskill: 948     Craft Rank: Grand Master Spellcrafter';

export type Harness = ReturnType<typeof boot>;

/** A fresh plugin instance enabled against a fresh mock runtime. */
export function boot(overrides: Record<string, unknown> = {}) {
  const mock = createMockApi(defaultConfig(overrides));
  const plugin = createCraftingHelperPlugin();
  const cleanup = plugin.onEnable!(mock.api) as (() => void) | void;
  return { mock, plugin, cleanup };
}

export const alias = (h: Harness, cmd: string) => h.plugin.onAlias!(h.mock.api, cmd);

export const statusOf = (h: Harness): string => {
  alias(h, 'crafthelper improve status');
  return h.mock.terminalWrites.at(-1)!;
};

/** Improve run for spellcrafting at skill 948 → the engine is `crafting` 'diamond gemstone'. */
export function reachCrafting(h: Harness) {
  alias(h, 'crafthelper improve spellcraft start');
  h.mock.feedLine(SCORE_SPELL_948);
  jest.advanceTimersByTime(200);
}

/** Order run for 1x diamond gem pain → engine is `crafting` (two components pulled). */
export function reachOrderCrafting(h: Harness, spec = '90+') {
  alias(h, `crafthelper order add 1 'diamond gem pain' ${spec}`);
  jest.advanceTimersByTime(200);
  jest.advanceTimersByTime(200);
}

export const ORDERS_KEY = (characterKey: string) => `shatteredarchive.plugins.crafting-helper.orders.${characterKey}`;

export const validOrder = (id: string, over: Partial<StoredCraftOrder> = {}): StoredCraftOrder => ({
  id,
  itemName: 'diamond gem pain',
  quantityRemaining: 2,
  quantityTotal: 2,
  qualitySpec: { kind: 'atLeast', min: 90 },
  createdAt: 1,
  ...over,
});

/** Fresh module instances (the storage is a module-level singleton): seed localStorage BEFORE calling this. */
export function freshModules() {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports */
  return {
    storage: require('./crafting-helper-storage') as typeof import('./crafting-helper-storage'),
    plugin: require('./crafting-helper.plugin') as typeof import('./crafting-helper.plugin'),
    harness: require('./crafting-helper.test-harness') as typeof import('./crafting-helper.test-harness'),
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}
