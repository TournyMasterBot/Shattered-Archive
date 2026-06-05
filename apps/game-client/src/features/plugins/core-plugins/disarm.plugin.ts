// apps\game-client\src\features\plugins\core-plugins\disarm.plugin.ts
import type { IPluginModule, PluginEvent, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * Weapon map (config textarea): one entry per line.
 *   <full item name> | <alias> [| nodrop]
 *
 * - <full item name>  The exact weapon name as it appears in the event payload.
 * - <alias>           The short alias used in ~get / wield commands.
 * - nodrop            Optional flag. When present, uses ~wield instead of ~get + wield.
 *
 * Examples:
 *   the Magius Staff | magius
 *   the Darkstaff | darkstaff
 *   a scorched staff covered in charred runes | hoopak | nodrop
 *
 * Lines starting with # are comments.
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface WeaponEntry {
  fullName: string; // exact match key
  alias: string; // short alias for ~get / wield
  nodrop: boolean; // if true: ~wield alias; if false: ~get alias + wield alias
}

// ── Parsing ─────────────────────────────────────────────────────────────────

function parseWeaponMap(raw: unknown): WeaponEntry[] {
  if (typeof raw !== 'string') return [];

  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .flatMap((l) => {
      const parts = l.split('|').map((p) => p.trim());
      const fullName = parts[0];
      const alias = parts[1];
      if (!fullName || !alias) return [];

      const nodrop = (parts[2] ?? '').toLowerCase() === 'nodrop';
      return [{ fullName, alias, nodrop }];
    });
}

// ── Default config ──────────────────────────────────────────────────────────

export const DEFAULT_WEAPON_MAP_CONFIG = [
  '# Map the exact item name to a short alias',
  '# Format: full item name | alias | nodrop (nodrop is optional)',
  '#',
  '# the Magius Staff | magius',
  '# the Darkstaff | darkstaff',
  '# the icy staff of the Seven Seas | sea',
  '# the staff of the Blind Prince | blind',
  '# a grand arcanium hoopak | hoopak',
  '# a scorched staff covered in charred runes | hoopak | nodrop',
  '# a grand arcanium glaive | glaive',
  '# the sword of the GODS | god',
].join('\n');

// ── Plugin ──────────────────────────────────────────────────────────────────

export function createDisarmPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'disarm',
      name: 'Auto Re-wield',
      version: '0.1.0',
      description:
        'When your weapon is disarmed, automatically retrieves and re-wields it. Configure a weapon map to match your inventory aliases.',
    },

    configSchema: {
      defaults: {
        weapons: DEFAULT_WEAPON_MAP_CONFIG,
        debug: false,
      },
      fields: [
        {
          key: 'weapons',
          type: 'textarea',
          label: 'Weapon map',
          description:
            'One weapon per line: full item name | alias | nodrop (nodrop is optional). Lines starting with # are comments.',
          placeholder: 'the Magius Staff | magius\na scorched staff covered in charred runes | hoopak | nodrop',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Logs disarm events and weapon lookups to the script console.',
        },
      ],
    },

    onEvent(api: PluginRuntimeApi, evt: PluginEvent): void {
      if (evt.name !== 'event:disarm') return;

      const cfg = api.getConfig();
      const debug = cfg.debug === true;
      const weapons = parseWeaponMap(cfg.weapons);

      const itemName = typeof evt.payload === 'string' ? evt.payload : null;

      if (debug) {
        api.log(`[Auto Re-wield] event:disarm fired — payload: ${JSON.stringify(evt.payload)}`);
      }

      if (!itemName) {
        if (debug) api.log('[Auto Re-wield] payload was not a string, ignoring.');
        return;
      }

      const entry = weapons.find((w) => w.fullName === itemName);

      if (!entry) {
        api.log(`[Auto Re-wield] No mapping for "${itemName}". Add it in the configure panel.`);
        return;
      }

      if (debug) {
        api.log(`[Auto Re-wield] matched "${itemName}" → alias="${entry.alias}" nodrop=${entry.nodrop}`);
      }

      if (entry.nodrop) {
        api.sendCommand(`~wield ${entry.alias}`);
      } else {
        api.sendCommand(`~get ${entry.alias}`);
        api.sendCommand(`wield ${entry.alias}`);
      }
    },
  };
}
