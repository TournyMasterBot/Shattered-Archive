/**
 * The private test-character matrix: one row per race/class pair with a codename and a male and a female character name.
 * The file lives only in the DSL data repository (docs/copilot/test-character-matrix.json). Names in it are real names of
 * test characters: this module reads them into memory to recognise a login and never writes or reports them.
 */

export type MatrixGender = 'M' | 'F';

export interface MatrixHit {
  /** Base codename of the row (a mineral name or C### id). The display form adds the gender: `Agate-F`. */
  codename: string;
  gender: MatrixGender;
}

export interface RejectedRow {
  /** Position of the row in the input array. */
  index: number;
  /** A reason that never contains a name. */
  reason: string;
}

export interface TestMatrix {
  /** Number of rows accepted. */
  rows: number;
  lookup(name: string): MatrixHit | undefined;
  /**
   * Every test character name, normalised (lower-case), with its codename and gender. Real names: for scrubbing text that leaves the
   * data directory, never for output.
   */
  entries(): { name: string; codename: string; gender: MatrixGender }[];
}

/** Name as compared: trimmed and lower-cased. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

const CODENAME = /^[A-Za-z][A-Za-z0-9]{0,23}$/;
const CHARACTER_NAME = /^[A-Za-z][A-Za-z'-]{1,29}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A name column is a valid name, or null/undefined/empty (the row has no character of that gender yet). */
function checkName(value: unknown): { ok: true; name: string | undefined } | { ok: false } {
  if (value === null || value === undefined || value === '') return { ok: true, name: undefined };
  if (typeof value !== 'string' || !CHARACTER_NAME.test(value.trim())) return { ok: false };
  return { ok: true, name: value.trim() };
}

/**
 * Validate the matrix JSON (an array of rows) and index its names.
 * A malformed row is rejected and reported by position; it never stops the others. A codename used twice, or a name used twice
 * (case-insensitively), rejects the later row, because a name must map to exactly one codename. Throws only when the input is not
 * an array at all.
 */
export function loadMatrix(json: unknown): { matrix: TestMatrix; rejected: RejectedRow[] } {
  if (!Array.isArray(json)) throw new TypeError('test-character matrix must be an array of rows');

  const byName = new Map<string, MatrixHit>();
  const codenames = new Set<string>();
  const rejected: RejectedRow[] = [];
  let rows = 0;

  json.forEach((row: unknown, index) => {
    if (!isRecord(row)) {
      rejected.push({ index, reason: 'row is not an object' });
      return;
    }
    const codename = row.codename;
    if (typeof codename !== 'string' || !CODENAME.test(codename)) {
      rejected.push({ index, reason: 'codename missing or malformed' });
      return;
    }
    if (codenames.has(codename.toLowerCase())) {
      rejected.push({ index, reason: 'codename used twice' });
      return;
    }
    const male = checkName(row.male);
    const female = checkName(row.female);
    if (!male.ok || !female.ok) {
      rejected.push({ index, reason: 'male or female name malformed' });
      return;
    }
    const names: [string | undefined, MatrixGender][] = [
      [male.name, 'M'],
      [female.name, 'F'],
    ];
    const keys = names.flatMap(([name]) => (name === undefined ? [] : [normalizeName(name)]));
    if (keys.some((key) => byName.has(key)) || (keys.length === 2 && keys[0] === keys[1])) {
      rejected.push({ index, reason: 'name used twice' });
      return;
    }

    codenames.add(codename.toLowerCase());
    for (const [name, gender] of names) {
      if (name !== undefined) byName.set(normalizeName(name), { codename, gender });
    }
    rows++;
  });

  return {
    matrix: {
      rows,
      lookup: (name) => byName.get(normalizeName(name)),
      entries: () => [...byName].map(([name, hit]) => ({ name, codename: hit.codename, gender: hit.gender })),
    },
    rejected,
  };
}
