// apps/game-client/src/features/plugins/core-plugins/people.plugin.ts
//
// Parses who-list and whois output to build a player database.
// The database is shared with the Highlighter plugin via peopleDb.ts.
//
// Aliases:
//   show info  <name>                      — look up by name prefix
//   show kinfo <name>                      — filter by kingdom
//   show cinfo <name>                      — filter by clan
//   show craft <name>                      — filter by craft
//   set status <name> [enemy|neutral|ally] — tag a player for annotation
//   set team <name> <tag>                  — assign a team label (use 'none' to clear)

import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { stripAnsi } from '../../autoleveling/autoleveling-text';
import { getPerson, setPerson, findPeople, findByOrg, findByCraft, dbSize } from './peopleDb';

// ── Known organizations ────────────────────────────────────────────────

const CLAN_LIST = new Set([
  'Black Robes', 'Red Robes', 'White Robes', 'Bloodlust',
  'Shalonesti', 'Justice', 'Knighthood', 'Shadow',
  'Slayers', 'Wargar', 'Chaos', 'Loner',
  'Renegade', 'Dragon', 'Demon', 'Angel', 'Balanx',
]);

const KINGDOM_MAP: Record<string, string> = {
  Verminasia: 'VR', Thaxanos: 'THAX', Althainia: 'AL',
  Arkane: 'AR', 'New Thalos': 'NT', Shalonesti: 'SH', Retired: 'Retired',
};

const KINGDOM_LIST = new Set([
  'AR', 'VR', 'SH', 'AL', 'NT', 'THAX',
  'Abaddon', 'Marauders', 'Ganth', 'Nordmaar', 'Darkonin',
  'Gray Church', 'Retired', ...Object.values(KINGDOM_MAP),
]);

const CRAFT_NAMES = new Set([
  'Spellcrafter', 'Armorcrafter', 'Tailor',
  'Weaponsmith (Blunt)', 'Weaponsmith (Sharp)',
  'Smelter', 'Tanner', 'Miller', 'Miner', 'Hunter', 'Lumberjack',
]);

// ── Who-list regex patterns ────────────────────────────────────────────
// Derived from DSL_PNP_People.lua trigger_patterns.

// [lvl race class] [AFK?] [Quiet?] (WANTED?) (org) Name Rank...
const RE_KINGDOM_ORG =
  /^\[\s*(\d+)\s+([\w-]+)\s+(\w+)\]\s*(?:\[(?:AFK|Quiet)\]\s*)*(?:\(WANTED\)\s*)?\(([^)]+)\)\s+([\w\s'-]+)/;

// [lvl race class] [AFK?] [ clan ] Name Rank... (no parentheses = clan)
const RE_CLAN =
  /^\[\s*(\d+)\s+([\w-]+)\s+(\w+)\]\s*(?:\[(?:AFK|Quiet)\]\s*)*\[([^\]]+)\]\s+([\w\s'-]+)/;

// [lvl  class] (WANTED?) (org) Name (level only + class, no race field)
const RE_KINGDOM_SHORT =
  /^\[\s*(\d+)\s+()(\w+)\]\s*(?:\(\w+\)\s*)*\(([^)]+)\)\s+([\w\s']+)/;

// [lvl  class] [clan] Name
const RE_CLAN_SHORT =
  /^\[\s*(\d+)\s+()(\w+)\]\s*\[([^\]]+)\]\s+([\w']+)/;

// Name - Rank Craft  (who craft output)
const RE_CRAFT = new RegExp(
  `^([\\w']+)\\s+-\\s+([\\w\\s]+)\\s+(${[...CRAFT_NAMES].map((c) => c.replace(/[()]/g, '\\$&')).join('|')})`,
);

// ── Name parsing ───────────────────────────────────────────────────────

// Common rank words that prefix names on who lists
const RANK_PREFIXES = new Set([
  'Abbott', 'Admiral', 'Ambassador', 'Apprentice', 'Archmage', 'Baron', 'Bishop',
  'Captain', 'Cardinal', 'Champion', 'Chancellor', 'Commander', 'Count', 'Dame',
  'Duchess', 'Duke', 'Earl', 'Elder', 'Emperor', 'General', 'Grand', 'Guardian',
  'High', 'Inquisitor', 'King', 'Knight', 'Lady', 'Legend', 'Lieutenant', 'Lord',
  'Magistrate', 'Marshal', 'Master', 'Minister', 'Noble', 'Overlord', 'Prince',
  'Princess', 'Private', 'Queen', 'Regent', 'Sage', 'Sergeant', 'Sir', 'Sister',
  'Slave', 'Soldier', 'Sultan', 'Supreme', 'Templar', 'Veteran', 'Warden', 'Warlord',
]);

function parseName(raw: string): string {
  let words = raw.trim().split(/\s+/);
  // Skip leading rank words
  while (words.length > 1 && RANK_PREFIXES.has(words[0])) {
    words = words.slice(1);
  }
  return words[0] ?? '';
}

function normalizeKingdom(org: string): string {
  return KINGDOM_MAP[org] ?? org;
}

// ── Gather a person from a who-list match ──────────────────────────────

function gatherPerson(
  orgType: 'clan' | 'kingdom',
  level: string,
  race: string,
  cls: string,
  org: string,
  rawName: string,
  debug: boolean,
  api: PluginRuntimeApi,
) {
  const lvl = parseInt(level, 10);
  if (!Number.isFinite(lvl) || lvl >= 52) return; // skip immortals

  if (orgType === 'clan' && !CLAN_LIST.has(org)) return;
  if (orgType === 'kingdom' && org !== '' && !KINGDOM_LIST.has(org)) return;

  const name = parseName(rawName);
  if (!name || name.length < 2) return;

  const normalizedOrg = orgType === 'kingdom' ? normalizeKingdom(org) : org;

  const existing = getPerson(name);
  const update = {
    name: existing?.name ?? name,
    level: lvl || existing?.level,
    race: race || existing?.race,
    class: cls || existing?.class,
    org: normalizedOrg,
    orgType,
  };

  if (debug) api.log(`people: ${orgType} ${name} (${normalizedOrg})`);
  setPerson(name, update);
}

function gatherCraft(name: string, rank: string, craft: string, debug: boolean, api: PluginRuntimeApi) {
  const parsedName = parseName(name);
  if (!parsedName) return;
  if (debug) api.log(`people craft: ${parsedName} — ${rank} ${craft}`);
  setPerson(parsedName, {
    name: getPerson(parsedName)?.name ?? parsedName,
    craft: craft.trim(),
    craftRank: rank.trim(),
  });
}

function tryParseLine(line: string, debug: boolean, api: PluginRuntimeApi) {
  // Try craft first (different format — no brackets)
  const craft = line.match(RE_CRAFT);
  if (craft) {
    gatherCraft(craft[1], craft[2], craft[3], debug, api);
    return;
  }

  // Kingdom with org
  const kOrg = line.match(RE_KINGDOM_ORG);
  if (kOrg) {
    gatherPerson('kingdom', kOrg[1], kOrg[2], kOrg[3], kOrg[4].trim(), kOrg[5], debug, api);
    return;
  }

  // Clan
  const clan = line.match(RE_CLAN);
  if (clan) {
    gatherPerson('clan', clan[1], clan[2], clan[3], clan[4].trim(), clan[5], debug, api);
    return;
  }

  // Short kingdom
  const kShort = line.match(RE_KINGDOM_SHORT);
  if (kShort) {
    gatherPerson('kingdom', kShort[1], kShort[2], kShort[3], kShort[4].trim(), kShort[5], debug, api);
    return;
  }

  // Short clan
  const cShort = line.match(RE_CLAN_SHORT);
  if (cShort) {
    gatherPerson('clan', cShort[1], cShort[2], cShort[3], cShort[4].trim(), cShort[5], debug, api);
    return;
  }
}

// ── Plugin factory ─────────────────────────────────────────────────────

export function createPeoplePlugin(): IPluginModule {
  function onEnable(api: PluginRuntimeApi): () => void {
    const cfg = api.getConfig();
    api.log(`People DB ready — ${dbSize()} people known.`);

    const off = api.onEvent('shatteredarchive:raw-data', (payload: any) => {
      const rawText = String(payload?.rawText ?? payload?.text ?? '');
      if (!rawText) return;

      const plain = stripAnsi(rawText).replace(/\r/g, '');
      const debug = cfg.debug === true;

      for (const line of plain.split('\n')) {
        const t = line.trim();
        if (t) tryParseLine(t, debug, api);
      }
    });

    return () => {
      off();
    };
  }

  function onAlias(api: PluginRuntimeApi, input: string): boolean | undefined {
    const t = input.trim();

    // set status <name> [enemy|neutral|ally]
    const statusMatch = t.match(
      /^set\s+status\s+(\S+)(?:\s+(enemy|neutral|ally))?\s*$/i,
    );
    if (statusMatch) {
      const name = statusMatch[1].trim();
      const requested = statusMatch[2]?.toLowerCase() as 'enemy' | 'neutral' | 'ally' | undefined;
      const person = getPerson(name);
      if (!person) {
        api.writeTerminal(`{R"${name}" not found in People database.{x\n`);
      } else {
        const newStatus =
          requested ?? (person.status === 'enemy' ? 'neutral' : 'enemy');
        setPerson(person.name, { status: newStatus });
        api.writeTerminal(`Status of {W${person.name}{x set to ${newStatus}.\n`);
      }
      return true;
    }

    // set team <name> <tag>  (use 'none' to clear)
    const teamMatch = t.match(/^set\s+team\s+([\w']+)\s+(.+)$/i);
    if (teamMatch) {
      const name = teamMatch[1].trim();
      const tag = teamMatch[2].trim().toLowerCase() === 'none' ? undefined : teamMatch[2].trim();
      const person = getPerson(name);
      if (!person) {
        api.writeTerminal(`{R"${name}" not found in People database.{x\n`);
      } else {
        setPerson(person.name, { team: tag });
        api.writeTerminal(
          tag
            ? `{W${person.name}{x assigned to team ${tag}.\n`
            : `Team for {W${person.name}{x cleared.\n`,
        );
      }
      return true;
    }

    const m = t.match(/^show\s+(info|kinfo|cinfo|craft)\s+([\w'\s]+)$/i);
    if (!m) return false;

    const show = m[1].toLowerCase();
    const query = m[2].trim();

    let results =
      show === 'kinfo' ? findByOrg('kingdom', query)
      : show === 'cinfo' ? findByOrg('clan', query)
      : show === 'craft' ? findByCraft(query)
      : findPeople(query);

    if (results.length === 0) {
      api.writeTerminal(`{DNNo players found matching "${query}".{x\n`);
      return true;
    }

    for (const p of results.slice(0, 30)) {
      const lvl = String(p.level ?? '?').padStart(2);
      const race = (p.race ?? '').padEnd(6);
      const cls = (p.class ?? '').padEnd(3);
      const org = p.org ? `{C(${p.org}){x ` : '';
      const craft =
        show === 'craft'
          ? ` {D— ${p.craftRank ?? ''} ${p.craft ?? ''}{x`.trimEnd()
          : '';
      const date = p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : 'unknown';
      api.writeTerminal(
        `{W[${lvl} ${race} ${cls}]{x ${org}{W${p.name}{x${craft} {D: ${date}{x\n`,
      );
    }

    api.writeTerminal(`\n{DPlayers found: ${results.length}{x\n`);
    return true;
  }

  return {
    manifest: {
      id: 'people',
      name: 'People',
      version: '0.1.0',
      description:
        'Tracks player info (level, race, class, org) from who-list output. Powers the Highlighter plugin.',
    },

    configSchema: {
      defaults: { debug: false },
      fields: [
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Log each player added or updated from the who list.',
        },
      ],
    },

    onEnable,
    onAlias,
  };
}
