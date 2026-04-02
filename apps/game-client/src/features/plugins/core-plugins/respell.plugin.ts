// apps\game-client\src\features\plugins\core-plugins\respell.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * A spell entry defines what command to use when an affect drops.
 *
 * Format (one per line in the textarea):
 *   <affect name> | <cast command>
 *
 * Examples:
 *   sanctuary | cast 'sanctuary'
 *   haste | cast 'haste'
 *   berserk | berserk
 *   song of war | sing 'song of war'
 *
 * Lines starting with # are comments and are ignored.
 * If the cast command is omitted, defaults to:  cast '<affect name>'
 *
 * Triggers on:
 *   game:affect-removed  — GMCP immediate notification (payload: { n: string, ... })
 *   game:affects-trueup  — periodic full list refresh; any configured affect absent
 *                          from the list that was previously seen is treated as dropped
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface SpellEntry {
  affect: string;   // lowercase for matching
  command: string;
}

// ── Parsing ────────────────────────────────────────────────────────────────

function parseSpellList(raw: unknown): SpellEntry[] {
  if (typeof raw !== 'string') return [];

  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => {
      const pipeIdx = l.indexOf('|');
      if (pipeIdx === -1) {
        const affect = l.trim().toLowerCase();
        return { affect, command: `cast '${l.trim()}'` };
      }
      const affect = l.slice(0, pipeIdx).trim().toLowerCase();
      const command = l.slice(pipeIdx + 1).trim();
      return { affect, command: command || `cast '${l.slice(0, pipeIdx).trim()}'` };
    })
    .filter((e) => e.affect.length > 0);
}

/**
 * Extract the affect name from a game:affect-removed payload.
 * The GMCP remove_affect message parses to an object with `.n` as the name
 * (matching the AffectData shape used by useAffectsBlock).
 */
function extractAffectName(payload: unknown): string {
  if (typeof payload === 'string') return payload.trim().toLowerCase();
  const p = payload as any;
  return String(p?.n ?? p?.name ?? p?.affect ?? '').trim().toLowerCase();
}

/**
 * Extract the set of affect names from a game:affects-trueup payload.
 * The GMCP affect_data message parses to an array of AffectData objects,
 * or an object with an `affects` array.
 */
function extractTrueupNames(payload: unknown): Set<string> {
  const arr: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.affects)
      ? (payload as any).affects
      : [];

  const names = new Set<string>();
  for (const item of arr) {
    const name = String(item?.n ?? item?.name ?? '').trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

// ── Default config ─────────────────────────────────────────────────────────

export const DEFAULT_SPELL_LIST = [
  '# Format: affect name | cast command',
  "# If command is omitted, defaults to: cast '<affect name>'",
  '#',
  '# Examples:',
  "sanctuary | cast 'sanctuary'",
  "haste | cast 'haste'",
].join('\n');

// ── Plugin ─────────────────────────────────────────────────────────────────

export function createRespellPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'respell',
      name: 'Auto Respell',
      version: '0.1.0',
      description: 'Automatically recasts spells when they drop. Configure one spell per line.',
    },

    configSchema: {
      defaults: {
        spells: DEFAULT_SPELL_LIST,
        cooldownMs: 500,
        debug: false,
      },
      fields: [
        {
          key: 'spells',
          type: 'textarea',
          label: 'Spell list',
          description:
            "One spell per line: affect name | cast command. " +
            "Lines starting with # are comments. " +
            "Omit the | command to default to: cast '<affect name>'",
          placeholder: "sanctuary | cast 'sanctuary'\nhaste | cast 'haste'",
        },
        {
          key: 'cooldownMs',
          type: 'number',
          label: 'Recast delay (ms)',
          description: 'How long to wait after a drop before recasting (avoids flooding).',
          min: 0,
          max: 10000,
          step: 100,
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Logs affect events and matched spell casts.',
        },
      ],
    },

    onEnable(api: PluginRuntimeApi) {
      // Per-spell recast cooldown: affect name → timestamp of last recast
      // Shared between affect-removed and affects-trueup to prevent double-casting.
      const lastRecast = new Map<string, number>();

      // Last known set of active affect names from the most recent trueup.
      // Populated on first trueup; used to diff subsequent trueups.
      let lastTrueupNames: Set<string> | null = null;

      const handleRemoved = (affectName: string) => {
        const cfg = api.getConfig();
        const spells = parseSpellList(cfg.spells);
        const match = spells.find((s) => s.affect === affectName);

        if (!match) {
          if (cfg.debug) api.log(`dropped: "${affectName}" (not in spell list)`);
          return;
        }

        const delayMs = typeof cfg.cooldownMs === 'number' && cfg.cooldownMs >= 0
          ? cfg.cooldownMs
          : 500;

        const now = Date.now();
        const last = lastRecast.get(affectName) ?? 0;
        const guardMs = Math.max(delayMs, 500);

        if (now - last < guardMs) {
          if (cfg.debug) api.log(`dropped: "${affectName}" — suppressed (cooldown)`);
          return;
        }

        lastRecast.set(affectName, now);

        if (cfg.debug) api.log(`"${affectName}" dropped → "${match.command}" (delay: ${delayMs}ms)`);

        if (delayMs > 0) {
          window.setTimeout(() => api.sendCommand(match.command), delayMs);
        } else {
          api.sendCommand(match.command);
        }
      };

      const offRemoved = api.onEvent('game:affect-removed', (payload) => {
        const name = extractAffectName(payload);
        if (name) handleRemoved(name);
      });

      const offTrueup = api.onEvent('game:affects-trueup', (payload) => {
        const current = extractTrueupNames(payload);

        if (lastTrueupNames !== null) {
          // Any affect that was present before but is absent now has dropped
          for (const name of lastTrueupNames) {
            if (!current.has(name)) {
              handleRemoved(name);
            }
          }
        }

        lastTrueupNames = current;
      });

      return () => {
        offRemoved();
        offTrueup();
      };
    },
  };
}
