/**
 * Replace character names in free text with codenames (edge case PRIVNAME-01).
 *
 * Names appear in tells, room lines, `whoisic` headers and quoted speech, so replacing a `name` field is not enough: every
 * registered name is replaced wherever it occurs, case-insensitively and inside longer words, and name-shaped words in the
 * positions where the game prints a player name are replaced by `<name>` even when they are not registered.
 *
 * It over-scrubs on purpose: privacy beats fidelity. A name shorter than 3 characters would hit too many ordinary words, so it is
 * matched only as a whole word.
 */

export interface ScrubEntry {
  /** The real name, as typed or logged. */
  name: string;
  /** What to write instead, normally `formatCodename(codename, gender)`, for example `Orion-M`. */
  replacement: string;
}

export interface ScrubOptions {
  /** `redact` (default) also replaces unregistered name-shaped words in player-name positions; `keep` leaves them. */
  unknownNames?: 'redact' | 'keep';
}

export interface ScrubResult {
  text: string;
  /** Registered names replaced. */
  replaced: number;
  /** Unregistered name-shaped words replaced by `<name>`. */
  unknown: number;
}

export const UNKNOWN_NAME_PLACEHOLDER = '<name>';

const MIN_SUBSTRING_LENGTH = 3;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Words that can stand where a player name does but are not names. */
const NOT_A_NAME = new Set([
  'You', 'Someone', 'Somebody', 'Everyone', 'Nobody', 'The', 'This', 'That', 'There', 'It', 'He', 'She', 'They', 'We', 'And', 'But',
]);

/**
 * Positions where the game prints a player's name. Each pattern has three groups: what comes before the name, the name, and
 * what comes after it. A name already replaced by a codename (`Orion-M`) is skipped by the lookahead.
 */
const NAME_POSITIONS: RegExp[] = [
  // "<Name> tells you 'hi'", "[OOC] <Name> says ...", "<Name> gossips ..."
  /^((?:\[[^\]\n]*\]\s*)?)([A-Z][a-z]{2,19})(?!-[MFU]\b)(\s+(?:tells you|asks you|replies|answers|says|exclaims|yells|shouts|gossips|whispers|chats|OOCs|auctions)\b)/gm,
  // "You tell <Name> 'hi'", "You reply to <Name> ..."
  /(\bYou (?:tell|reply to|ask|whisper to|answer) )([A-Z][a-z]{2,19})(?!-[MFU]\b)(\b)/g,
  // "IC Information for <Name>."
  /(IC Information for )([A-Z][a-z]{2,19})(?!-[MFU]\b)(\.)/g,
];

function buildRegisteredPattern(entries: readonly ScrubEntry[]): { pattern: RegExp | null; byKey: Map<string, string> } {
  const byKey = new Map<string, string>();
  for (const entry of entries) {
    const key = entry.name.trim().toLowerCase();
    if (key !== '' && !byKey.has(key)) byKey.set(key, entry.replacement);
  }
  const keys = [...byKey.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  if (keys.length === 0) return { pattern: null, byKey };

  // Longest first so a name that contains another is replaced as a whole ("annabel" before "anna").
  const long = keys.filter((k) => k.length >= MIN_SUBSTRING_LENGTH).map(escapeRegExp);
  const short = keys.filter((k) => k.length < MIN_SUBSTRING_LENGTH).map(escapeRegExp);
  const alternatives: string[] = [];
  if (long.length > 0) alternatives.push(long.join('|'));
  if (short.length > 0) alternatives.push(`\\b(?:${short.join('|')})\\b`);
  return { pattern: new RegExp(alternatives.join('|'), 'giu'), byKey };
}

/** Replace registered names, then (by default) name-shaped words in player-name positions. Pure and idempotent. */
export function scrub(text: string, entries: readonly ScrubEntry[], options: ScrubOptions = {}): ScrubResult {
  let replaced = 0;
  let unknown = 0;
  let out = text;

  const { pattern, byKey } = buildRegisteredPattern(entries);
  if (pattern) {
    out = out.replace(pattern, (match: string, offset: number, whole: string) => {
      const replacement = byKey.get(match.toLowerCase()) ?? UNKNOWN_NAME_PLACEHOLDER;
      // Idempotence: a real name that equals the base of its own codename ("Orion" -> "Orion-M") must not become "Orion-M-M".
      const base = replacement.replace(/-[MFU]$/, '');
      if (match.toLowerCase() === base.toLowerCase() && /^-[MFU]\b/.test(whole.slice(offset + match.length))) return match;
      replaced++;
      return replacement;
    });
  }

  if ((options.unknownNames ?? 'redact') === 'redact') {
    for (const position of NAME_POSITIONS) {
      out = out.replace(position, (all: string, before: string, name: string, after: string) => {
        if (NOT_A_NAME.has(name)) return all;
        unknown++;
        return `${before}${UNKNOWN_NAME_PLACEHOLDER}${after}`;
      });
    }
  }

  return { text: out, replaced, unknown };
}
