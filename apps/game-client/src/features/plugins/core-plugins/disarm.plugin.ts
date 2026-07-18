// apps\game-client\src\features\plugins\core-plugins\disarm.plugin.ts
import type { IPluginModule, PluginEvent, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * Weapon map (config textarea): one entry per line.
 *   <full item name> | <alias> [| nodrop]
 *
 * - <full item name>  The exact weapon name as it appears in your <wielded> eq slot.
 * - <alias>           The short alias used in ~get / wield commands.
 * - nodrop            Optional flag. When present, uses ~wield instead of ~get + wield.
 *
 * Examples:
 *   the Magius Staff | magius
 *   the Darkstaff | darkstaff
 *   a scorched staff covered in charred runes | hoopak | nodrop
 *
 * Lines starting with # are comments.
 *
 * `event:disarm` payload: { wielded: string, attacker: string }. When "Announce
 * attacker" is on, the attacker is echoed to the terminal in the configured color
 * before any re-wield attempt (so it fires even if the weapon has no mapping).
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface WeaponEntry {
  fullName: string; // exact match key
  alias: string; // short alias for ~get / wield
  nodrop: boolean; // if true: ~wield alias; if false: ~get alias + wield alias
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Extracts the disarmed weapon name from an `event:disarm` payload.
 *
 * The event is fired by the equipment-delta hook as `{ wielded: string }`,
 * where `wielded` is the weapon that was in the <wielded> slot at the moment
 * of the disarm (the manager clears the slot immediately after, so the payload
 * is the only reliable source). A bare string is tolerated for forward/back
 * compatibility. Leading status tokens like "(Glowing)" are stripped so the
 * name matches the clean keys in the weapon map.
 */
function extractWieldedName(payload: unknown): string | null {
  const raw =
    typeof payload === 'string'
      ? payload
      : payload && typeof payload === 'object' && typeof (payload as { wielded?: unknown }).wielded === 'string'
        ? (payload as { wielded: string }).wielded
        : '';

  let name = raw.trim();
  // Strip any number of leading "(...)" status tokens: "(Glowing) (Humming) sword" -> "sword"
  while (name.startsWith('(')) {
    const end = name.indexOf(')');
    if (end < 0) break;
    name = name.slice(end + 1).trimStart();
  }

  return name.length > 0 ? name : null;
}

/**
 * Extracts the attacker's name from an `event:disarm` payload (`{ attacker: string }`).
 * Absent on older/malformed payloads, so callers must treat this as optional.
 */
function extractAttacker(payload: unknown): string | null {
  const raw =
    payload && typeof payload === 'object' && typeof (payload as { attacker?: unknown }).attacker === 'string'
      ? (payload as { attacker: string }).attacker
      : '';

  const name = raw.trim();
  return name.length > 0 ? name : null;
}

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
      version: '0.2.0',
      description:
        'When your weapon is disarmed, announces who did it and automatically retrieves and re-wields it. Configure a weapon map to match your inventory aliases.',
    },

    configSchema: {
      defaults: {
        weapons: DEFAULT_WEAPON_MAP_CONFIG,
        announceAttacker: true,
        attackerColor: '{r',
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
          key: 'announceAttacker',
          type: 'boolean',
          label: 'Announce attacker',
          description: 'Echo who disarmed you to the terminal when you get disarmed.',
        },
        {
          key: 'attackerColor',
          type: 'string',
          label: 'Announcement color',
          description: 'DSL color code for the attacker announcement (e.g. {r for red).',
          placeholder: '{r',
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

      const itemName = extractWieldedName(evt.payload);
      const attacker = extractAttacker(evt.payload);

      if (debug) {
        api.log(`[Auto Re-wield] event:disarm fired — payload: ${JSON.stringify(evt.payload)}`);
      }

      if (cfg.announceAttacker !== false && attacker) {
        const color = (String(cfg.attackerColor ?? '{r').trim() || '{r') as string;
        api.writeTerminal(`${color}*** DISARMED by ${attacker}! ***{x\n`);
      }

      if (!itemName) {
        if (debug) api.log('[Auto Re-wield] no wielded weapon in payload, ignoring.');
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
