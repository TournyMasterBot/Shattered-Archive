import type { CharacterRecord, Gender, Validated } from '@shatteredarchive/copilot-core';

/**
 * The three files of the character registry, all in the private data directory:
 *
 * - `names.jsonl`: NameEntry, the ONLY place a real name exists (as the id). Backs copilot-core's CharacterStore.
 * - `index.jsonl`: CharacterIndexRecord, one per character that has played, test or real. No name; this is what the API lists.
 * - `descriptions.jsonl`: StoredDescription, the newest `whoisic` description of each character. No name.
 */

export type CharacterKindName = 'test' | 'real';

/** `id` is the NORMALISED REAL NAME. Private. */
export interface NameEntry extends CharacterRecord {
  id: string;
}

export interface CharacterIndexRecord {
  /** `real:<base>` or `test:<base>-<M|F>`: see `characterId`. */
  id: string;
  codename: string;
  kind: CharacterKindName;
  gender: Gender;
  /** First 16 hex digits of sha256 of the normalised name: lets two files be matched without carrying the name. */
  nameHash: string;
  firstSeen: number;
  lastSeen: number;
}

export interface StoredDescription {
  id: string;
  codename: string;
  kind: CharacterKindName;
  /** Epoch ms of the `whoisic` header in the log. The newest `at` wins. */
  at: number;
  /** Appearance fields by label (Eyes, Hair, Profession, Age, Sex, ...). */
  fields: Record<string, string>;
  hasDescription: boolean;
  rawAnsi: string;
  dsl: string;
  text: string;
  unmapped: string[];
}

const NAME_KEY = /^[a-z][a-z'-]{1,29}$/;
const BASE = /^[A-Za-z][A-Za-z0-9]{0,23}$/;
const HASH = /^[0-9a-f]{16}$/;
const GENDERS = ['M', 'F', 'U'] as const;
const MAX_TEXT = 100_000;
const MAX_FIELDS = 40;
const MAX_FIELD_TEXT = 400;
const MAX_UNMAPPED = 100;

/** The id a character is stored under. Test characters are one per (codename, gender); a real character keeps one id as its gender is learned. */
export function characterId(kind: CharacterKindName, codename: string, gender: Gender): string {
  return kind === 'real' ? `real:${codename}` : `test:${codename}-${gender}`;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function fail<T>(errors: string[]): Validated<T> {
  return { ok: false, errors };
}

/** The keys of `input` that are not in `allowed`: an unknown field is a rejected record (no silent loss of a future field). */
function unknownKeys(input: Obj, allowed: readonly string[]): string[] {
  return Object.keys(input).filter((k) => !allowed.includes(k));
}

export function validateNameEntry(input: unknown): Validated<NameEntry> {
  if (!isObj(input)) return fail(['not an object']);
  const errors = unknownKeys(input, ['id', 'codename', 'kind', 'gender', 'firstSeen', 'lastSeen']).map(() => 'unknown field');
  if (typeof input.id !== 'string' || !NAME_KEY.test(input.id)) errors.push('id');
  if (typeof input.codename !== 'string' || !BASE.test(input.codename)) errors.push('codename');
  if (input.kind !== 'real') errors.push('kind');
  if (!GENDERS.includes(input.gender as Gender)) errors.push('gender');
  if (!isTime(input.firstSeen)) errors.push('firstSeen');
  if (!isTime(input.lastSeen)) errors.push('lastSeen');
  if (errors.length > 0) return fail(errors);
  const e = input as unknown as NameEntry;
  return { ok: true, value: { id: e.id, codename: e.codename, kind: 'real', gender: e.gender, firstSeen: e.firstSeen, lastSeen: e.lastSeen } };
}

/** The id a record must have for its kind, codename and gender. */
function idMatches(id: unknown, kind: unknown, codename: unknown, gender: unknown): boolean {
  if ((kind !== 'real' && kind !== 'test') || typeof codename !== 'string' || !GENDERS.includes(gender as Gender)) return false;
  if (kind === 'test' && gender === 'U') return false;
  return id === characterId(kind, codename, gender as Gender);
}

export function validateIndexRecord(input: unknown): Validated<CharacterIndexRecord> {
  if (!isObj(input)) return fail(['not an object']);
  const errors = unknownKeys(input, ['id', 'codename', 'kind', 'gender', 'nameHash', 'firstSeen', 'lastSeen']).map(() => 'unknown field');
  if (typeof input.codename !== 'string' || !BASE.test(input.codename)) errors.push('codename');
  if (!idMatches(input.id, input.kind, input.codename, input.gender)) errors.push('id');
  if (typeof input.nameHash !== 'string' || !HASH.test(input.nameHash)) errors.push('nameHash');
  if (!isTime(input.firstSeen)) errors.push('firstSeen');
  if (!isTime(input.lastSeen)) errors.push('lastSeen');
  if (errors.length > 0) return fail(errors);
  const r = input as unknown as CharacterIndexRecord;
  return {
    ok: true,
    value: { id: r.id, codename: r.codename, kind: r.kind, gender: r.gender, nameHash: r.nameHash, firstSeen: r.firstSeen, lastSeen: r.lastSeen },
  };
}

function text(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

export function validateDescription(input: unknown): Validated<StoredDescription> {
  if (!isObj(input)) return fail(['not an object']);
  const errors = unknownKeys(input, ['id', 'codename', 'kind', 'at', 'fields', 'hasDescription', 'rawAnsi', 'dsl', 'text', 'unmapped']).map(
    () => 'unknown field',
  );
  if (typeof input.codename !== 'string' || !BASE.test(input.codename)) errors.push('codename');
  if (input.kind !== 'real' && input.kind !== 'test') errors.push('kind');
  if (typeof input.id !== 'string' || !/^(real:[A-Za-z][A-Za-z0-9]{0,23}|test:[A-Za-z][A-Za-z0-9]{0,23}-[MF])$/.test(input.id)) errors.push('id');
  else if (!input.id.startsWith(`${String(input.kind)}:${String(input.codename)}`)) errors.push('id');
  if (!isTime(input.at)) errors.push('at');
  if (typeof input.hasDescription !== 'boolean') errors.push('hasDescription');
  for (const key of ['rawAnsi', 'dsl', 'text'] as const) if (!text(input[key], MAX_TEXT)) errors.push(key);

  const fields = input.fields;
  if (!isObj(fields) || Object.keys(fields).length > MAX_FIELDS) errors.push('fields');
  else for (const [k, v] of Object.entries(fields)) if (k.length > 40 || !text(v, MAX_FIELD_TEXT)) errors.push('fields');

  const unmapped = input.unmapped;
  if (!Array.isArray(unmapped) || unmapped.length > MAX_UNMAPPED || !unmapped.every((u) => text(u, 40))) errors.push('unmapped');

  if (errors.length > 0) return fail([...new Set(errors)]);
  const d = input as unknown as StoredDescription;
  return {
    ok: true,
    value: {
      id: d.id,
      codename: d.codename,
      kind: d.kind,
      at: d.at,
      fields: { ...d.fields },
      hasDescription: d.hasDescription,
      rawAnsi: d.rawAnsi,
      dsl: d.dsl,
      text: d.text,
      unmapped: [...d.unmapped],
    },
  };
}
