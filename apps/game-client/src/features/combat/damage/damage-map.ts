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

export const ANSI_COLOR_GREEN_PREFIX = '\x1B[0;32m';
export const ANSI_COLOR_YELLOW_PREFIX = '\x1B[1;33m';
export const ANSI_COLOR_RED_PREFIX = '\x1B[1;31m';
export const ANSI_COLOR_WHITE_PREFIX = '\x1B[1;37m';
export const ANSI_COLOR_SUFFIX = '\x1B[0m';

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
  for (const key of sortedKeys) {
    if (logLine.includes(` ${key} `)) {
      return (DamageMapInstance as any)[key];
    }
  }
  return null;
}

export function getDamageKeyIndex(logLine: string): { key: keyof IDamageMap; index: number } | null {
  for (const key of sortedKeys) {
    const index = logLine.indexOf(key);
    if (index !== -1) {
      return { key, index };
    }
  }
  return null;
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

export default DamageMap;
