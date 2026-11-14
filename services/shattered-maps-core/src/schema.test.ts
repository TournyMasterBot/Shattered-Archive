import {
  cloneJson,
  DATE_PATTERN,
  DIRECTIONS,
  emptyBaseline,
  emptyMap,
  ID_PATTERN,
  isDirection,
  LIMITS,
  MAP_SCHEMA_VERSION,
  OPPOSITE,
} from './schema.js';
import { sampleMap } from './testing/fixtures.js';
import { DEFAULT_MAX_TEXT, parseMapFile, validateMapFile } from './validate.js';

describe('schema constants and helpers', () => {
  it('has ten exit slots and a reverse for each that comes back to the start', () => {
    expect(DIRECTIONS).toHaveLength(10);
    for (const d of DIRECTIONS) {
      expect(OPPOSITE[d]).not.toBe(d);
      expect(OPPOSITE[OPPOSITE[d]]).toBe(d);
    }
  });

  it('recognises only the ten directions, as upper-case text', () => {
    expect(DIRECTIONS.every(isDirection)).toBe(true);
    for (const bad of ['n', 'north', '', null, undefined, 3, 'UP']) expect(isDirection(bad)).toBe(false);
  });

  it('writes the version the reader accepts', () => {
    expect(MAP_SCHEMA_VERSION).toBe(1);
    expect(emptyMap()).toEqual({ version: 1, continents: [], links: [] });
    expect(emptyMap('2026-11-07')).toEqual({ version: 1, generatedAt: '2026-11-07', continents: [], links: [] });
    expect(emptyBaseline()).toEqual({ visits: 0, days: [], contents: [], was: [] });
  });

  it('accepts ids that are safe in a path and an attribute, and nothing else', () => {
    for (const ok of ['r1', 'rabc0123456', 'town-main', 'a.b_c:d-e', '0']) expect(ID_PATTERN.test(ok)).toBe(true);
    for (const bad of ['', 'R1', '-a', '.a', 'a b', 'a/b', 'a"b', '<x>', 'a'.repeat(65)])
      expect(ID_PATTERN.test(bad)).toBe(false);
  });

  it('accepts a day or a UTC timestamp, and nothing else', () => {
    for (const ok of ['2026-11-07', '2026-11-07T20:07:26Z', '2026-11-07T20:07:26.376Z'])
      expect(DATE_PATTERN.test(ok)).toBe(true);
    for (const bad of ['2026-11-7', '11/07/2026', '2026-11-07T20:07', '2026-11-07 20:07:26', 'today'])
      expect(DATE_PATTERN.test(bad)).toBe(false);
  });

  it('copies deeply, so a changed copy leaves the original alone', () => {
    const original = sampleMap();
    const copy = cloneJson(original);
    copy.continents[0].areas[0].subzones[0].rooms[0].title = 'Changed';
    expect(original.continents[0].areas[0].subzones[0].rooms[0].title).toBe('Market Square');
  });
});

describe('MapFile round trip', () => {
  it('writes and reads the sample map back to an equal map', () => {
    const map = sampleMap();
    const result = parseMapFile(JSON.stringify(map));
    expect(result.ok).toBe(true);
    expect(result.ok && result.map).toEqual(map);
    const again = parseMapFile(JSON.stringify(result.ok ? result.map : null, null, 2));
    expect(again.ok && again.map).toEqual(map);
  });

  it('reads an empty map', () => {
    expect(parseMapFile(JSON.stringify(emptyMap()))).toEqual({ ok: true, map: emptyMap() });
  });

  it('rejects a map written for a version this reader does not know', () => {
    for (const version of [0, 2, '1', null]) {
      const result = validateMapFile({ ...sampleMap(), version });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors[0]).toMatch(/map\.version: unsupported version/);
    }
    const missing: Record<string, unknown> = { ...sampleMap() };
    delete missing.version;
    expect(validateMapFile(missing).ok).toBe(false);
  });

  it('rejects an oversize file by its length, before parsing it', () => {
    const big = `{"version":1,"continents":[],"links":[],"generatedAt":"${'x'.repeat(2_000)}"}`;
    const result = parseMapFile(big, 1_000);
    expect(result).toEqual({ ok: false, errors: [`map: ${big.length} characters, the most allowed is 1000`] });
    expect(DEFAULT_MAX_TEXT).toBe(40_000_000);
  });

  it('rejects oversize lists and counts', () => {
    const tooManyContinents = {
      ...emptyMap(),
      continents: Array.from({ length: LIMITS.maxContinents + 1 }, (_, i) => ({ id: `c${i}`, name: 'C', areas: [] })),
    };
    const r1 = validateMapFile(tooManyContinents);
    expect(!r1.ok && r1.errors[0]).toMatch(/map\.continents: has 17 entries, the most allowed is 16/);
  });
});
