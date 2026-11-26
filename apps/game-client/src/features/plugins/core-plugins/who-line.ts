// apps/game-client/src/features/plugins/core-plugins/who-line.ts
//
// One parser for the who-list family of lines (who, whoc, whok, whois, clan rosters), shared by
// people.plugin.ts and auto-group-logic.ts so the two cannot drift apart. No imports on purpose: it
// can be run straight against the game-log corpus.
//
// Shapes confirmed against the Docker game-server log corpus (2026-11-21, ~26,000 who-style lines):
//   "[51  Human Arm] [ Shadow ] Tiberius Caine, Acolyte of Shadow"   race + class, clan
//   "[51 DGnome Pri] (Gray Church) Monsignor Patron Tief (Turpa)"     kingdom
//   "[51 Lagoda Cha] Lohla, Keeper of Coin and Confidence."          no affiliation
//   "[51  Human Shu] [ Shadow ] (Hostile) (WANTED) Melchaleve ..."   status flags after the clan
//   "[51 Kender Wit] (Queen)(Verminasia) Piknim Cracklespark"        rank beside the kingdom, either order
//   "[51 Skn] [ Shadow*]  Telthian  Sovereign  (Leader)"             clan roster: class only; `*` = prestige
//   "[42 Dra] ( Dragon )  Uriol  Member"                             some clans print in parens
//   "[51  Arch Ang ] ( Angel ) Raphiel, Commander of Heaven's Host"  space before the closing bracket
//   "[51 Skn] Kabal            79% hp  55% mana 100% mv"             a `gr` group row: NOT a who line
//
// The `*` is the PRESTIGE marker: a character who served 1000+ hours in a clan or kingdom and passed
// the prestige quest (famous or infamous there, +5% damage). It is part of the clan or kingdom token,
// "[ Shadow*]" or "(Nordmaar*)", and is not part of the affiliation's name. A `*` anywhere else is
// decoration in the title ("[*]", "[*****]", "<<=*=>>") and is left alone in `rest`.

export interface WhoLine {
  level: number;
  /** '' when the line has no race column (clan rosters print the class only). */
  race: string;
  class: string;
  /** Clan or kingdom as the game printed it (prestige `*` removed); '' when there is none. */
  org: string;
  orgType: 'clan' | 'kingdom' | '';
  /** Everything after the stat block, flags and affiliation: the name and title text. */
  rest: string;
}

// Two or three tokens: "[51 Mtl]" is class only, "[51  Human Arm]" is race + class.
const RE_STAT = /^\[\s*(\d+)\s+([^\s\]]+)(?:\s+([^\s\]]+))?\s*\]/;
const RE_STATUS_BRACKET = /^\s*\[\s*(?:AFK|Quiet)\s*\]/i;
const RE_STATUS_PAREN = /^\s*\((?:WANTED|Hostile)\)/i;
const RE_CLAN = /^\s*\[\s*([^\]]+?)\s*\]/;
// One or more adjacent paren groups: "(NT)" or a rank beside the kingdom, "(Queen)(Verminasia)".
const RE_KINGDOM_GROUP = /^\s*((?:\([^)]+\))+)/;
const RE_PAREN_PART = /\(([^)]+)\)/g;
// A `gr` row ends "NN% hp NN% mana NN% mv"; a who line never does.
const RE_GROUP_ROW = /\d+%\s+hp\b/;

// The same realm prints under both names, so a list entry for either must match the other.
const ALIAS_GROUPS: string[][] = [
  ['verminasia', 'vr'],
  ['thaxanos', 'thax'],
  ['althainia', 'al'],
  ['arkane', 'ar'],
  ['new thalos', 'nt'],
  ['shalonesti', 'sh'],
];
const ALIASES = new Map<string, string[]>(ALIAS_GROUPS.flatMap((g) => g.map((m) => [m, g] as [string, string[]])));

// Used only to tell the kingdom from a rank when two parens sit side by side.
const KNOWN_KINGDOMS = new Set<string>([
  ...ALIAS_GROUPS.flat(),
  'abaddon',
  'marauders',
  'ganth',
  'nordmaar',
  'darkonin',
  'gray church',
  'retired',
]);

// These are clans, but the game prints them in round brackets like a kingdom: "( Dragon )" (2,200
// lines in the corpus), "( Balanx )", "( Angel )", "( Demon )".
const PAREN_CLANS = new Set<string>(['dragon', 'balanx', 'angel', 'demon']);

/** Lowercase keys that all name one affiliation: itself plus its long/short form, if it has one. */
export function affiliationKeys(value: string): string[] {
  const v = value.trim().toLowerCase();
  return ALIASES.get(v) ?? [v];
}

/** "Shadow*" -> "Shadow": the prestige star is not part of the name. */
function stripPrestige(token: string): string {
  return token.trim().replace(/\*+$/, '').trim();
}

function pickKingdom(group: string): string {
  const parts = [...group.matchAll(RE_PAREN_PART)]
    .map((m) => stripPrestige(m[1]))
    .filter((p) => !/^(?:WANTED|Hostile)$/i.test(p));
  // The flag loop in parseWhoLine consumed any leading flag, so the first part is never a flag.
  if (parts.length === 1) return parts[0];
  // "(Queen)(Verminasia)" and "(HighLord)(Marauders)": a rank sits beside the kingdom, either side.
  // With no known kingdom among them the rank-first order is the common one, so take the last.
  return parts.find((p) => KNOWN_KINGDOMS.has(p.toLowerCase())) ?? parts[parts.length - 1];
}

/**
 * Parse a who-list style line (what `who`, `whoc`, `whois` and clan rosters print). Returns null for
 * any other line, for a `gr` group row, and for a line whose structure it cannot read (a bracket or
 * paren left where the name should be), so a half-understood line is never stored as "no affiliation".
 * Status flags ([AFK], (WANTED), (Hostile)) are skipped wherever they sit between the stat block and
 * the name. The first other [..] is a clan, the first other (..) a kingdom, unless it is one of the
 * clans the game prints in parens.
 */
export function parseWhoLine(line: string): WhoLine | null {
  const stat = RE_STAT.exec(line);
  if (!stat) return null;

  let rest = line.slice(stat[0].length);
  let org = '';
  let orgType: WhoLine['orgType'] = '';

  for (let guard = 0; guard < 10; guard++) {
    const flag = RE_STATUS_BRACKET.exec(rest) ?? RE_STATUS_PAREN.exec(rest);
    if (flag) {
      rest = rest.slice(flag[0].length);
      continue;
    }
    if (orgType === '') {
      const clan = RE_CLAN.exec(rest);
      // A bare number is not a clan: area lists print "[ 5 35] [ 0] Haon Daran" (level range, count).
      if (clan && !/^\d+$/.test(clan[1].trim())) {
        // "[ Shadow*]": the star is the prestige marker; the clan is still Shadow.
        org = stripPrestige(clan[1]);
        orgType = 'clan';
        rest = rest.slice(clan[0].length);
        continue;
      }
      const kingdom = RE_KINGDOM_GROUP.exec(rest);
      if (kingdom) {
        org = pickKingdom(kingdom[1]);
        orgType = PAREN_CLANS.has(org.toLowerCase()) ? 'clan' : 'kingdom';
        rest = rest.slice(kingdom[0].length);
        continue;
      }
    }
    break;
  }

  if (/^\s*[[(]/.test(rest)) return null;
  if (RE_GROUP_ROW.test(rest)) return null;

  return {
    level: parseInt(stat[1], 10),
    race: stat[3] === undefined ? '' : stat[2],
    class: stat[3] ?? stat[2],
    org,
    orgType,
    rest: rest.trim(),
  };
}

/** True when `name` appears as a whole word in the text after the stat block ("Monsignor Patron Tief"). */
export function whoLineMentionsName(rest: string, name: string): boolean {
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z'])${escaped}(?![A-Za-z'])`, 'i').test(rest);
}
