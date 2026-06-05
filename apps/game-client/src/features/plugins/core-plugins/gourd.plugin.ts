// apps/game-client/src/features/plugins/core-plugins/gourd.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';
import { DispatchEvent } from '../../event-emitter/event-dispatcher';

/**
 * Gourd Helper — tracks your potion gourd inventory.
 *
 * Aliases (type in the command bar):
 *   scan gourds        — lore all gourds in inventory and build the list
 *   remove gourd <n>   — manually remove gourd #n from the list
 *   gq <spell|#>       — quaff a gourd by spell name or list number
 *   gd <spell|#>       — drop a gourd by spell name or list number
 *   toss <spell|#>     — toss a gourd (falls through if not found in list)
 *   apply <spell|#>    — apply a gourd (falls through if not found in list)
 *
 * The gourd list is displayed in the Affects panel — enable this plugin
 * to show the Gourds tab alongside the Affects Summary.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface GourdEntry {
  name: string;
  nameIndex: number; // disambiguation: 2nd copy of same name gets index 2
  spells: string[];
}

// ── Trigger patterns (from DSL_PNP_Gourd.lua) ─────────────────────────

const RE_GOURD_NAME = /Name\(s\):\s*'witch potion gourd ([a-zA-Z ]+)'/i;
const RE_GOURD_SPELLS = /Level \d+ spells of:\s*'(.+)'\./;
const RE_EVAPORATE = /potion gourd of (.+) has evaporated from disuse/i;
const RE_TOSS_CONFIRM = /^You throw a gourd right at /;
const RE_LORE_FAIL = /^Can't make heads or tails of it\./;
const RE_SCAN_END = /^You do not have that item\./;

// ── Helpers ────────────────────────────────────────────────────────────

function sortGourds(db: GourdEntry[]): GourdEntry[] {
  return [...db].sort((a, b) => (a.name !== b.name ? a.name.localeCompare(b.name) : b.nameIndex - a.nameIndex));
}

/** The mud item reference used in commands: e.g. "2.healing" */
function gourdRef(g: GourdEntry): string {
  return `${g.nameIndex}.${g.name}`;
}

function resolveGourd(sorted: GourdEntry[], ref: string): GourdEntry | null {
  const trimmed = ref.trim();
  if (/^\d+$/.test(trimmed)) {
    return sorted[parseInt(trimmed, 10) - 1] ?? null;
  }
  const lc = trimmed.toLowerCase();
  return sorted.find((g) => g.spells.some((s) => s.toLowerCase().includes(lc))) ?? null;
}

// ── Plugin factory ─────────────────────────────────────────────────────

export function createGourdPlugin(): IPluginModule {
  let db: GourdEntry[] = [];
  let scanIndex = 0;
  let scanning = false;
  let pendingName: string | null = null;
  let lastTossedRef: string | null = null;

  // ── State helpers ──────────────────────────────────────────────────

  function broadcast() {
    DispatchEvent('plugin:gourd:list-updated', { list: sortGourds(db) });
  }

  function addGourd(name: string, spells: string[]) {
    const next = [...db];
    if (scanning) {
      const sameCount = next.filter((g) => g.name === name).length;
      next.push({ name, nameIndex: sameCount + 1, spells });
    } else {
      // Outside scan: new gourd is "newest" (index 1); bump existing copies up
      for (const g of next) {
        if (g.name === name) g.nameIndex += 1;
      }
      next.push({ name, nameIndex: 1, spells });
    }
    db = next;
    broadcast();
  }

  function removeAt(sortedIndex: number) {
    const sorted = sortGourds(db);
    const target = sorted[sortedIndex - 1];
    if (!target) return;
    const next = db.filter((g) => g !== target);
    // Compress nameIndexes for siblings
    for (const g of next) {
      if (g.name === target.name && g.nameIndex > target.nameIndex) {
        g.nameIndex -= 1;
      }
    }
    db = next;
    broadcast();
  }

  function removeBySpell(spellRef: string) {
    const sorted = sortGourds(db);
    const g = resolveGourd(sorted, spellRef);
    if (!g) return;
    removeAt(sorted.indexOf(g) + 1);
  }

  // ── Scan logic ─────────────────────────────────────────────────────

  function nextScan(api: PluginRuntimeApi) {
    scanIndex += 1;
    api.sendCommand(`lore ${scanIndex}.gourd`);
  }

  function startScan(api: PluginRuntimeApi) {
    scanning = true;
    scanIndex = 0;
    db = [];
    broadcast();
    api.log('Starting gourd scan...');
    nextScan(api);
  }

  function endScan(api: PluginRuntimeApi) {
    scanning = false;
    api.log(`Gourd scan complete — ${db.length} gourd(s) found.`);
  }

  // ── onEnable ──────────────────────────────────────────────────────

  function onEnable(api: PluginRuntimeApi): () => void {
    DispatchEvent('plugin:gourd:active', { active: true });
    broadcast();

    const off = api.onEvent('shatteredarchive:raw-data', (payload: any) => {
      const rawText = String(payload?.rawText ?? payload?.text ?? '');
      if (!rawText) return;

      const plain = stripAnsi(rawText).replace(/\r/g, '');
      const debug = api.getConfig().debug === true;

      for (const line of plain.split('\n')) {
        const t = line.trim();
        if (!t) continue;

        // Gourd name from lore output
        const nameMatch = t.match(RE_GOURD_NAME);
        if (nameMatch) {
          pendingName = nameMatch[1].trim();
          if (debug) api.log(`gourd name: "${pendingName}"`);
          continue;
        }

        // Spells from lore output
        const spellMatch = t.match(RE_GOURD_SPELLS);
        if (spellMatch && pendingName !== null) {
          const spells = spellMatch[1]
            .split("' '")
            .map((s) => s.replace(/'/g, '').trim())
            .filter(Boolean);
          if (debug) api.log(`gourd spells: ${spells.join(', ')}`);
          addGourd(pendingName, spells);
          pendingName = null;
          if (scanning) nextScan(api);
          continue;
        }

        // Gourd evaporated from disuse
        const evapMatch = t.match(RE_EVAPORATE);
        if (evapMatch) {
          if (debug) api.log(`evaporated: "${evapMatch[1]}"`);
          removeBySpell(evapMatch[1].trim());
          continue;
        }

        // Toss confirmation — remove the gourd we threw
        if (RE_TOSS_CONFIRM.test(t) && lastTossedRef !== null) {
          if (debug) api.log(`toss confirmed, removing: "${lastTossedRef}"`);
          removeBySpell(lastTossedRef);
          lastTossedRef = null;
          continue;
        }

        // Lore failed on a non-gourd item mid-scan — skip to next index
        if (scanning && RE_LORE_FAIL.test(t)) {
          if (debug) api.log('lore fail during scan, skipping to next');
          pendingName = null;
          nextScan(api);
          continue;
        }

        // No more gourds in inventory — end scan
        if (scanning && RE_SCAN_END.test(t)) {
          endScan(api);
          continue;
        }
      }
    });

    return () => {
      off();
      DispatchEvent('plugin:gourd:active', { active: false });
      db = [];
      scanIndex = 0;
      scanning = false;
      pendingName = null;
      lastTossedRef = null;
    };
  }

  // ── onAlias ───────────────────────────────────────────────────────

  function onAlias(api: PluginRuntimeApi, input: string): boolean | undefined {
    const t = input.trim();

    // scan gourds
    if (/^scan\s+gourds$/i.test(t)) {
      startScan(api);
      return true;
    }

    // remove gourd <n>
    const removeMatch = t.match(/^remove\s+gourd\s+(\d+)$/i);
    if (removeMatch) {
      removeAt(parseInt(removeMatch[1], 10));
      api.log(`Removed gourd #${removeMatch[1]}.`);
      return true;
    }

    // gq <ref> — quaff
    const gqMatch = t.match(/^gq\s+['"]?([\w\s]+?)['"]?\s*$/i);
    if (gqMatch) {
      const sorted = sortGourds(db);
      const g = resolveGourd(sorted, gqMatch[1].trim());
      if (g) {
        const ref = gourdRef(g);
        removeAt(sorted.indexOf(g) + 1);
        api.sendCommand(`quaff '${ref}'`);
      } else {
        api.sendCommand(`quaff ${gqMatch[1].trim()}`);
      }
      return true;
    }

    // gd <ref> — drop
    const gdMatch = t.match(/^gd\s+['"]?([\w\s]+?)['"]?\s*$/i);
    if (gdMatch) {
      const sorted = sortGourds(db);
      const g = resolveGourd(sorted, gdMatch[1].trim());
      if (g) {
        const ref = gourdRef(g);
        removeAt(sorted.indexOf(g) + 1);
        api.sendCommand(`drop '${ref}'`);
      } else {
        api.sendCommand(`drop ${gdMatch[1].trim()}`);
      }
      return true;
    }

    // toss <ref> — intercept only if matches a known gourd
    const tossMatch = t.match(/^(?:toss|tos)\s+['"]?([\w\s]+?)['"]?\s*$/i);
    if (tossMatch) {
      const sorted = sortGourds(db);
      const g = resolveGourd(sorted, tossMatch[1].trim());
      if (g) {
        lastTossedRef = gourdRef(g);
        api.sendCommand(`toss '${gourdRef(g)}'`);
        return true;
      }
      return false; // not a gourd — fall through to mud
    }

    // apply <ref> [target] — intercept only if matches a known gourd
    const applyMatch = t.match(/^(?:apply|appl|app)\s+['"]?([\w\s]+?)['"]?(?:\s+(.+))?\s*$/i);
    if (applyMatch) {
      const sorted = sortGourds(db);
      const g = resolveGourd(sorted, applyMatch[1].trim());
      if (g) {
        const target = applyMatch[2]?.trim() ?? '';
        removeAt(sorted.indexOf(g) + 1);
        api.sendCommand(`apply '${gourdRef(g)}'${target ? ` ${target}` : ''}`);
        return true;
      }
      return false; // not a gourd — fall through to mud
    }

    return false;
  }

  return {
    manifest: {
      id: 'gourd',
      name: 'Gourd Helper',
      version: '0.1.0',
      description:
        'Tracks your potion gourd inventory. Scan gourds to build the list, then quaff, apply, toss, or drop by spell name or number.',
    },

    configSchema: {
      defaults: {
        debug: false,
      },
      fields: [
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
