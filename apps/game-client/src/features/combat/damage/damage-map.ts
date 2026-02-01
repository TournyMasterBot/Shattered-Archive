export interface IDamageMap {
  // Greens
  misses: number;
  miss: number;
  scratches: number;
  scratch: number;
  grazes: number;
  graze: number;
  hits: number;
  hit: number;
  injures: number;
  injure: number;
  wounds: number;
  wound: number;
  mauls: number;
  maul: number;
  decimates: number;
  decimate: number;
  devastates: number;
  devastate: number;
  maims: number;
  maim: number;

  // Yellow
  MUTILATES: number;
  MUTILATE: number;
  DISEMBOWELS: number;
  DISEMBOWEL: number;
  DISMEMBERS: number;
  DISMEMBER: number;
  MASSACRES: number;
  MASSACRE: number;
  MANGLES: number;
  MANGLE: number;

  // Red
  DEMOLISHES: number;
  DEMOLISH: number;
  DEVASTATES: number;
  DEVASTATE: number;
  OBLITERATES: number;
  OBLITERATE: number;
  ANNIHILATES: number;
  ANNIHILATE: number;
  ERADICATES: number;
  ERADICATE: number;

  // Blinks
  GHASTLY: number;
  HORRID: number;
  DREADFUL: number;
  HIDEOUS: number;
  INDESCRIBABLE: number;
  UNSPEAKABLE: number;
}

export const damageMapKeys = new Set<keyof IDamageMap>([
  'misses',
  'miss',
  'scratches',
  'scratch',
  'grazes',
  'graze',
  'hits',
  'hit',
  'injures',
  'injure',
  'wounds',
  'wound',
  'mauls',
  'maul',
  'decimates',
  'decimate',
  'devastates',
  'devastate',
  'maims',
  'maim',

  'MUTILATES',
  'MUTILATE',
  'DISEMBOWELS',
  'DISEMBOWEL',
  'DISMEMBERS',
  'DISMEMBER',
  'MASSACRES',
  'MASSACRE',
  'MANGLES',
  'MANGLE',

  'DEMOLISHES',
  'DEMOLISH',
  'DEVASTATES',
  'DEVASTATE',
  'OBLITERATES',
  'OBLITERATE',
  'ANNIHILATES',
  'ANNIHILATE',
  'ERADICATES',
  'ERADICATE',

  'GHASTLY',
  'HORRID',
  'DREADFUL',
  'HIDEOUS',
  'INDESCRIBABLE',
  'UNSPEAKABLE',
]);

const sortedKeys = Array.from(damageMapKeys).sort((a, b) => b.length - a.length);

export function containsDamageKey(str: string): boolean {
  for (const key of sortedKeys) {
    if (str.includes(key)) {
      return true;
    }
  }
  return false;
}

export type DamageEventPayload = {
  key: keyof IDamageMap;
  amount: number;
  index: number;
  token: string;
  line: string;
  source?: string;
  target?: string;
};

export class DamageMap implements IDamageMap {
  // Greens
  public misses = 0.0;
  public miss = 0.0;
  public scratches = 2.5;
  public scratch = 2.5;
  public grazes = 6.5;
  public graze = 6.5;
  public hits = 10.5;
  public hit = 10.5;
  public injures = 14.5;
  public injure = 14.5;
  public wounds = 18.5;
  public wound = 18.5;
  public mauls = 22.5;
  public maul = 22.5;
  public decimates = 26.5;
  public decimate = 26.5;
  public devastates = 30.5;
  public devastate = 30.5;
  public maims = 34.5;
  public maim = 34.5;

  // Yellow
  public MUTILATES = 38.5;
  public MUTILATE = 38.5;
  public DISEMBOWELS = 42.5;
  public DISEMBOWEL = 42.5;
  public DISMEMBERS = 46.5;
  public DISMEMBER = 46.5;
  public MASSACRES = 50.5;
  public MASSACRE = 50.5;
  public MANGLES = 54.5;
  public MANGLE = 54.5;

  // Red
  public DEMOLISHES = 58.5;
  public DEMOLISH = 58.5;
  public DEVASTATES = 68;
  public DEVASTATE = 68;
  public OBLITERATES = 88;
  public OBLITERATE = 88;
  public ANNIHILATES = 113;
  public ANNIHILATE = 113;
  public ERADICATES = 138;
  public ERADICATE = 138;

  // Blinks
  public GHASTLY = 163;
  public HORRID = 188;
  public DREADFUL = 213;
  public HIDEOUS = 238;
  public INDESCRIBABLE = 263;
  public UNSPEAKABLE = 276;
}

export const ANSI_COLOR_GREEN_PREFIX = '\u001b[0;32m';
export const ANSI_COLOR_YELLOW_PREFIX = '\u001b[1;33m';
export const ANSI_COLOR_RED_PREFIX = '\u001b[1;31m';
export const ANSI_COLOR_WHITE_PREFIX = '\u001b[1;37m';
export const ANSI_COLOR_SUFFIX = '\u001b[0m';

export const DamageMapAnsi: Record<keyof DamageMap, string> = {
  // Greens
  misses: ANSI_COLOR_GREEN_PREFIX,
  miss: ANSI_COLOR_GREEN_PREFIX,
  scratches: ANSI_COLOR_GREEN_PREFIX,
  scratch: ANSI_COLOR_GREEN_PREFIX,
  grazes: ANSI_COLOR_GREEN_PREFIX,
  graze: ANSI_COLOR_GREEN_PREFIX,
  hits: ANSI_COLOR_GREEN_PREFIX,
  hit: ANSI_COLOR_GREEN_PREFIX,
  injures: ANSI_COLOR_GREEN_PREFIX,
  injure: ANSI_COLOR_GREEN_PREFIX,
  wounds: ANSI_COLOR_GREEN_PREFIX,
  wound: ANSI_COLOR_GREEN_PREFIX,
  mauls: ANSI_COLOR_GREEN_PREFIX,
  maul: ANSI_COLOR_GREEN_PREFIX,
  decimates: ANSI_COLOR_GREEN_PREFIX,
  decimate: ANSI_COLOR_GREEN_PREFIX,
  devastates: ANSI_COLOR_GREEN_PREFIX,
  devastate: ANSI_COLOR_GREEN_PREFIX,
  maims: ANSI_COLOR_GREEN_PREFIX,
  maim: ANSI_COLOR_GREEN_PREFIX,

  // Yellow
  MUTILATES: ANSI_COLOR_YELLOW_PREFIX,
  MUTILATE: ANSI_COLOR_YELLOW_PREFIX,
  DISEMBOWELS: ANSI_COLOR_YELLOW_PREFIX,
  DISEMBOWEL: ANSI_COLOR_YELLOW_PREFIX,
  DISMEMBERS: ANSI_COLOR_YELLOW_PREFIX,
  DISMEMBER: ANSI_COLOR_YELLOW_PREFIX,
  MASSACRES: ANSI_COLOR_YELLOW_PREFIX,
  MASSACRE: ANSI_COLOR_YELLOW_PREFIX,
  MANGLES: ANSI_COLOR_YELLOW_PREFIX,
  MANGLE: ANSI_COLOR_YELLOW_PREFIX,

  // Red
  DEMOLISHES: ANSI_COLOR_RED_PREFIX,
  DEMOLISH: ANSI_COLOR_RED_PREFIX,
  DEVASTATES: ANSI_COLOR_RED_PREFIX,
  DEVASTATE: ANSI_COLOR_RED_PREFIX,
  OBLITERATES: ANSI_COLOR_RED_PREFIX,
  OBLITERATE: ANSI_COLOR_RED_PREFIX,
  ANNIHILATES: ANSI_COLOR_RED_PREFIX,
  ANNIHILATE: ANSI_COLOR_RED_PREFIX,
  ERADICATES: ANSI_COLOR_RED_PREFIX,
  ERADICATE: ANSI_COLOR_RED_PREFIX,

  // Blinks
  GHASTLY: ANSI_COLOR_RED_PREFIX,
  HORRID: ANSI_COLOR_RED_PREFIX,
  DREADFUL: ANSI_COLOR_RED_PREFIX,
  HIDEOUS: ANSI_COLOR_RED_PREFIX,
  INDESCRIBABLE: ANSI_COLOR_RED_PREFIX,
  UNSPEAKABLE: ANSI_COLOR_WHITE_PREFIX,
};

export const DamageMapInstance = new DamageMap();

export function getDamageValue(logLine: string): number | null {
  return parseDamageLine(logLine)?.value ?? null;
}

export function getDamageKeyIndex(logLine: string): { key: keyof IDamageMap; index: number } | null {
  const parsed = parseDamageLine(logLine);
  return parsed ? { key: parsed.key, index: parsed.index } : null;
}

export function getLastDamageKeyIndex(logLine: string): { key: string; index: number } | null {
  let lastIndex = -1;
  let lastKey: string | null = null;

  for (const key of sortedKeys) {
    const index = logLine.lastIndexOf(key);
    if (index !== -1 && index > lastIndex) {
      lastIndex = index;
      lastKey = key;
    }
  }

  if (lastIndex !== -1 && lastKey) {
    return { key: lastKey, index: lastIndex };
  }

  return null;
}

export const DamageAnsiTokenToKey: Record<string, keyof IDamageMap> = Object.fromEntries(
  Array.from(damageMapKeys).map((key) => {
    const prefix = (DamageMapAnsi as Record<keyof IDamageMap, string>)[key];
    return [`${prefix}${key}${ANSI_COLOR_SUFFIX}`, key];
  }),
) as Record<string, keyof IDamageMap>;

export const DamageKeyToAnsiToken: Record<keyof IDamageMap, string> = Object.fromEntries(
  Array.from(damageMapKeys).map((key) => {
    const prefix = (DamageMapAnsi as Record<keyof IDamageMap, string>)[key];
    return [key, `${prefix}${key}${ANSI_COLOR_SUFFIX}`];
  }),
) as Record<keyof IDamageMap, string>;

const DAMAGE_ANSI_WORD_RE = /\u001b\[(?:0;32|1;33|1;31|1;37)m([A-Za-z]+)\u001b\[0m/g;

export function getDamageKeyFromLine(line: string): keyof IDamageMap | null {
  // super cheap reject
  if (line.indexOf('\u001b') === -1) return null;

  for (const m of line.matchAll(DAMAGE_ANSI_WORD_RE)) {
    const word = m[1] as keyof IDamageMap;
    if (damageMapKeys.has(word)) {
      return word;
    }
  }

  return null;
}

export function getDamageKeyByTokenLookup(line: string): keyof IDamageMap | null {
  // cheap reject
  if (line.indexOf('\u001b') === -1) return null;

  // scan for colored words and reconstruct exact token substring
  for (const m of line.matchAll(DAMAGE_ANSI_WORD_RE)) {
    const token = m[0]; // full match: prefix+word+suffix
    const key = DamageAnsiTokenToKey[token];
    if (key) return key;
  }

  return null;
}

export type ParsedDamageLine = {
  key: keyof IDamageMap;
  value: number;
  index: number; // index of the damage word inside the line
  token: string; // full ansi token: prefix + word + suffix
};

const ANSI_RESET = ANSI_COLOR_SUFFIX;
const ANSI_PREFIX_START = '\x1B[';

// strips any ANSI sequences but does NOT change casing
const ansiRe = /\x1B\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ansiRe, '');
}

/**
 * Parses a line for a colored damage "word".
 *
 * ✅ Works for normal colored verbs: \x1B[1;33mDISMEMBERS\x1B[0m
 * ✅ Works for candy-cane/blink verbs: \x1B[1;31mG\x1B[1;37mH...\x1B[0m
 * ✅ Ignores surrounding decoration: "***", ">>>", etc.
 * ✅ Casing matters: no transforms.
 */
export function parseDamageLine(line: string): ParsedDamageLine | null {
  // fast reject
  if (line.indexOf('\x1B') === -1) return null;

  let from = 0;

  while (true) {
    const start = line.indexOf(ANSI_PREFIX_START, from);
    if (start === -1) return null;

    const end = line.indexOf(ANSI_RESET, start);
    if (end === -1) return null; // malformed

    const token = line.slice(start, end + ANSI_RESET.length);

    // Plain text of the token (preserves casing)
    const plain = stripAnsi(token);

    // If this token becomes EXACTLY a damage key, we found it
    if (damageMapKeys.has(plain as keyof IDamageMap)) {
      const key = plain as keyof IDamageMap;
      const value = (DamageMapInstance as unknown as Record<keyof IDamageMap, number>)[key];

      // Find the first visible letter index inside the raw token
      // (we want an index in the original line, not the plain version)
      let firstLetterOffset = 0;
      for (let i = 0; i < token.length; i++) {
        const ch = token[i];

        // Skip ANSI sequences quickly
        if (ch === '\x1B' && token[i + 1] === '[') {
          const mIndex = token.indexOf('m', i);
          if (mIndex !== -1) {
            i = mIndex; // jump to end of ansi sequence
            continue;
          }
        }

        // First visible letter
        if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
          firstLetterOffset = i;
          break;
        }
      }

      return {
        key,
        value,
        index: start + firstLetterOffset,
        token,
      };
    }

    // Continue scanning after this token
    from = end + ANSI_RESET.length;
  }
}

export function tryParseTarget(line: string): string | null {
  const idx = line.lastIndexOf(' a ');
  if (idx === -1) return null;
  return line
    .slice(idx + 3)
    .replace(/[!\r\n]+$/, '')
    .trim();
}

function cleanSourcePrefix(s: string): string {
  // remove common decorations / trailing separators
  return s
    .replace(/[*>=<\-\s]+$/g, '') // trailing " *** " / " >>> " / etc
    .replace(/[,:;.\s]+$/g, '') // trailing punctuation
    .trim();
}

/**
 * Extracts the source phrase from the left side of the line.
 * Uses the start index of the matched damage verb token.
 */
export function parseDamageSource(line: string, tokenStartIndex: number): string | null {
  if (tokenStartIndex <= 0) return null;

  const left = line.slice(0, tokenStartIndex);
  const plain = stripAnsi(left).trim();
  if (!plain) return null;

  const cleaned = cleanSourcePrefix(plain);
  if (!cleaned) return null;

  // Strong special cases first
  if (cleaned.startsWith('Your ')) return 'Your';
  if (cleaned.startsWith('You ')) return 'You';

  // Otherwise return the full cleaned phrase
  // e.g. "A stonewood quarterstaff draws life from"
  return cleaned;
}

export default DamageMap;
