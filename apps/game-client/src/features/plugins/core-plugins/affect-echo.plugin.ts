// apps/game-client/src/features/plugins/core-plugins/affect-echo.plugin.ts
//
// Echoes affect gains and losses to the terminal window.
//
// Output format:
//   <upColor><affect name>{x up
//   <downColor><affect name>{x down
//
// Per-affect color overrides textarea format (one rule per line):
//   <affect name> | <up color> | <down color>
//
// DSL color code examples: {C (cyan), {Y (yellow), {G (green), {R (red), {B (blue)

import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

// ── Types ─────────────────────────────────────────────────────────────────

interface AffectColorRule {
  affect: string; // lowercase for matching
  upColor: string;
  downColor: string;
}

// ── Parsing ────────────────────────────────────────────────────────────────

function parseColorRules(raw: unknown): AffectColorRule[] {
  if (typeof raw !== 'string') return [];

  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .flatMap((l) => {
      const parts = l.split('|').map((p) => p.trim());
      const affect = parts[0]?.toLowerCase();
      if (!affect) return [];
      const upColor = parts[1] ?? '';
      const downColor = parts[2] ?? '';
      if (!upColor && !downColor) return [];
      return [{ affect, upColor, downColor }];
    });
}

// ── Payload helpers ────────────────────────────────────────────────────────

function extractAddedName(payload: unknown): string {
  const p = payload as any;
  // Payload is either { affect: AffectData } or AffectData directly
  const affect = p?.affect ?? p;
  return String(affect?.n ?? affect?.name ?? '').trim();
}

function extractRemovedName(payload: unknown): string {
  const p = payload as any;
  return String(p?.n ?? p?.name ?? '').trim();
}

// ── Default config ─────────────────────────────────────────────────────────

const DEFAULT_COLOR_OVERRIDES = [
  '# Override colors for specific affects.',
  '# Format: affect name | up color | down color',
  '# DSL color codes: {C cyan  {Y yellow  {G green  {R red  {B blue  {W white  {D dark',
  '#',
  '# Examples:',
  '# sanctuary | {G | {R',
  '# haste | {B | {Y',
].join('\n');

// ── Plugin ─────────────────────────────────────────────────────────────────

export function createAffectEchoPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'affect-echo',
      name: 'Affect Echo',
      version: '0.1.0',
      description:
        'Echoes affect gains and losses to the terminal with configurable colors. Supports per-affect color overrides.',
    },

    configSchema: {
      defaults: {
        upColor: '{C',
        downColor: '{Y',
        colorOverrides: DEFAULT_COLOR_OVERRIDES,
        debug: false,
      },
      fields: [
        {
          key: 'upColor',
          type: 'string',
          label: 'Up color',
          description: 'DSL color code applied when an affect is gained (e.g. {C for cyan).',
          placeholder: '{C',
        },
        {
          key: 'downColor',
          type: 'string',
          label: 'Down color',
          description: 'DSL color code applied when an affect is lost (e.g. {Y for yellow).',
          placeholder: '{Y',
        },
        {
          key: 'colorOverrides',
          type: 'textarea',
          label: 'Per-affect color overrides',
          description:
            'One override per line: affect name | up color | down color. ' +
            'Matched affect names override the global Up/Down colors above. ' +
            'Lines starting with # are comments.',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Logs affect events and color lookups to the script console.',
        },
      ],
    },

    onEnable(api: PluginRuntimeApi) {
      const offAdded = api.onEvent('game:affect-added', (payload) => {
        const name = extractAddedName(payload);
        if (!name) return;

        const cfg = api.getConfig();
        const overrides = parseColorRules(cfg.colorOverrides);
        const match = overrides.find((r) => r.affect === name.toLowerCase());

        const color = (match?.upColor || String(cfg.upColor ?? '{C')).trim() || '{C';

        if (cfg.debug) api.log(`[AffectEcho] added: "${name}" → ${color}`);

        api.writeTerminal(`${color}${name}{x up\n`);
      });

      const offRemoved = api.onEvent('game:affect-removed', (payload) => {
        const name = extractRemovedName(payload);
        if (!name) return;

        const cfg = api.getConfig();
        const overrides = parseColorRules(cfg.colorOverrides);
        const match = overrides.find((r) => r.affect === name.toLowerCase());

        const color = (match?.downColor || String(cfg.downColor ?? '{Y')).trim() || '{Y';

        if (cfg.debug) api.log(`[AffectEcho] removed: "${name}" → ${color}`);

        api.writeTerminal(`${color}${name}{x down\n`);
      });

      return () => {
        offAdded();
        offRemoved();
      };
    },
  };
}
