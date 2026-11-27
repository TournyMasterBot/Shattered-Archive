import { normalizeName, type TestMatrix } from './matrix.js';

/**
 * Base codenames for REAL characters (decision P10). Single words, so `<Base>-<M|F>` stays one token. They cannot collide with
 * the test matrix, whose codenames are minerals or C### ids. Constellations that are also names in the private matrix are left
 * out on purpose (two were found with `scripts/check-private-names.mjs`): a codename must never equal a character name, because
 * the privacy scrubber would treat it as one and the scan would flag every document that used it.
 */
export const CONSTELLATIONS: readonly string[] = [
  'Antlia', 'Apus', 'Aquarius', 'Aquila', 'Ara', 'Aries', 'Auriga', 'Bootes', 'Caelum',
  'Camelopardalis', 'Cancer', 'Capricornus', 'Carina', 'Centaurus', 'Cepheus', 'Cetus', 'Chamaeleon', 'Circinus',
  'Columba', 'Corvus', 'Crater', 'Crux', 'Cygnus', 'Delphinus', 'Dorado', 'Draco', 'Equuleus', 'Eridanus',
  'Fornax', 'Gemini', 'Grus', 'Hercules', 'Horologium', 'Hydra', 'Hydrus', 'Indus', 'Lacerta', 'Leo',
  'Lepus', 'Libra', 'Lupus', 'Lynx', 'Lyra', 'Mensa', 'Microscopium', 'Monoceros', 'Musca', 'Norma',
  'Octans', 'Ophiuchus', 'Orion', 'Pavo', 'Pegasus', 'Perseus', 'Phoenix', 'Pictor', 'Pisces', 'Puppis',
  'Pyxis', 'Reticulum', 'Sagitta', 'Sagittarius', 'Scorpius', 'Sculptor', 'Scutum', 'Serpens', 'Sextans', 'Taurus',
  'Telescopium', 'Triangulum', 'Tucana', 'Virgo', 'Volans', 'Vulpecula',
];

/** M or F once known; U while a real character's `whoisic` Sex has not been read yet. */
export type Gender = 'M' | 'F' | 'U';

export type CharacterKind = 'test' | 'real';

/** What the registry stores for a real character. It never contains the name: the store keys it by the normalised name. */
export interface CharacterRecord {
  codename: string;
  kind: 'real';
  gender: Gender;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Persistence for real characters, supplied by the server (a file in the private data directory). It is the only place a
 * real name exists, as the key. A single writer is assumed: serialise calls to `resolveCharacter` and `setGender`.
 */
export interface CharacterStore {
  get(nameKey: string): Promise<CharacterRecord | undefined>;
  /** Must be atomic: after a rejected promise the stored data is unchanged. */
  put(nameKey: string, record: CharacterRecord): Promise<void>;
  /** Base codenames already assigned. */
  codenames(): Promise<readonly string[]>;
}

export interface ResolvedCharacter {
  /** Base codename. Use `formatCodename` for the `Base-M` form that appears in documents and bundles. */
  codename: string;
  kind: CharacterKind;
  gender: Gender;
  /** True when this call registered a new real character. */
  isNew: boolean;
}

export class CodenameExhaustedError extends Error {
  constructor() {
    super(`all ${CONSTELLATIONS.length} real-character codenames are in use; extend CONSTELLATIONS`);
    this.name = 'CodenameExhaustedError';
  }
}

export function formatCodename(codename: string, gender: Gender): string {
  return `${codename}-${gender}`;
}

/** The next base codename not in `used` (case-insensitive), in list order. Throws when the list is exhausted. */
export function allocateCodename(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  const next = CONSTELLATIONS.find((c) => !taken.has(c.toLowerCase()));
  if (next === undefined) throw new CodenameExhaustedError();
  return next;
}

/**
 * Work out which codename a selected character plays under.
 *
 * 1. A name in the private test matrix is a TEST character: its row codename and the gender of the matching column. Nothing is
 *    stored; the matrix is the record (edge case E8: never re-registered).
 * 2. A name the store already knows keeps its codename; `lastSeen` is updated.
 * 3. Any other name is a REAL character and gets the next free constellation, gender `U` until `setGender`.
 *
 * Two different names never share a codename. If the store fails the error is thrown and nothing else has changed.
 */
export async function resolveCharacter(
  name: string,
  matrix: TestMatrix,
  store: CharacterStore,
  now: number,
): Promise<ResolvedCharacter> {
  const key = normalizeName(name);
  if (key === '') throw new Error('character name is empty');

  const test = matrix.lookup(key);
  if (test) return { codename: test.codename, kind: 'test', gender: test.gender, isNew: false };

  const existing = await store.get(key);
  if (existing) {
    await store.put(key, { ...existing, lastSeen: Math.max(existing.lastSeen, now) });
    return { codename: existing.codename, kind: 'real', gender: existing.gender, isNew: false };
  }

  const codename = allocateCodename(await store.codenames());
  await store.put(key, { codename, kind: 'real', gender: 'U', firstSeen: now, lastSeen: now });
  return { codename, kind: 'real', gender: 'U', isNew: true };
}

/** Record the gender of a registered real character once `whoisic` has shown it. Returns false when the name is not registered. */
export async function setGender(name: string, gender: 'M' | 'F', store: CharacterStore): Promise<boolean> {
  const key = normalizeName(name);
  const existing = await store.get(key);
  if (!existing) return false;
  if (existing.gender !== gender) await store.put(key, { ...existing, gender });
  return true;
}
