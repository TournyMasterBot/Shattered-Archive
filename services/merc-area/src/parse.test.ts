import fs from 'fs';
import path from 'path';

import { Reader } from './reader.js';
import { parseAreaFile, ParseError } from './parse.js';
import type { MobilesSection, ObjectsSection, RoomsSection, AreaHeaderSection } from './types.js';

// Jest runs with cwd = package root (pnpm --filter / local jest.config.cjs).
const fixture = (name: string) => fs.readFileSync(path.resolve('src/__fixtures__', name), 'utf8');

describe('Reader primitives (db.c fread_* semantics)', () => {
  it('reads numbers with signs and | chains', () => {
    const r = new Reader(' 42 -7 +3 1|2|4 ');
    expect(r.number()).toBe(42);
    expect(r.number()).toBe(-7);
    expect(r.number()).toBe(3);
    expect(r.number()).toBe(7);
  });

  it('reads flags in letter and numeric forms', () => {
    const r = new Reader('AB 0 64 A|C -5 z');
    expect(r.flag()).toBe(3); // A=1, B=2
    expect(r.flag()).toBe(0);
    expect(r.flag()).toBe(64);
    expect(r.flag()).toBe(5); // A=1 | C=4
    expect(r.flag()).toBe(-5);
    expect(r.flag()).toBe(2 ** 51); // 'z'
  });

  it('reads tilde strings, dropping \\r and preserving newlines', () => {
    const r = new Reader('  hello\r\nworld\n~ ~ next~');
    expect(r.string()).toBe('hello\nworld\n');
    expect(r.string()).toBe('');
    expect(r.string()).toBe('next');
  });

  it('reads quoted and bare words', () => {
    const r = new Reader(`sword 'cure light' "double'quote" end`);
    expect(r.word()).toBe('sword');
    expect(r.word()).toBe('cure light');
    expect(r.word()).toBe("double'quote");
    expect(r.word()).toBe('end');
  });

  it('reports 1-based line numbers in errors', () => {
    const r = new Reader('1\n2\nnotanumber');
    r.number();
    r.number();
    expect(() => r.number()).toThrow(ParseError);
    try {
      r.number();
    } catch (e) {
      expect((e as ParseError).line).toBe(3);
    }
  });
});

describe('parseAreaFile on fixtures', () => {
  it('parses limbo.are with expected content', () => {
    const area = parseAreaFile(fixture('limbo.are'));
    const kinds = area.sections.map((s) => s.kind);
    expect(kinds).toEqual(['area', 'mobiles', 'objects', 'rooms', 'resets', 'shops', 'specials']);

    const header = area.sections[0] as AreaHeaderSection;
    expect(header.fileName).toBe('limbo.are');
    expect(header.name).toBe('Limbo');

    const objects = (area.sections.find((s) => s.kind === 'objects') as ObjectsSection).objects;
    const silver = objects.find((o) => o.vnum === 1);
    expect(silver?.itemType).toBe('money');
    expect(silver?.weight).toBe(10);
    expect(silver?.condition).toBe('P');
  });

  it('parses midgaard.are (large real-world area)', () => {
    const area = parseAreaFile(fixture('midgaard.are'));
    const rooms = (area.sections.find((s) => s.kind === 'rooms') as RoomsSection).rooms;
    expect(rooms.length).toBeGreaterThan(100);
    const temple = rooms.find((r) => r.vnum === 3001);
    expect(temple).toBeDefined();
    expect(temple!.name.length).toBeGreaterThan(0);
    expect(temple!.exits.length).toBeGreaterThan(0);

    const mobs = (area.sections.find((s) => s.kind === 'mobiles') as MobilesSection).mobiles;
    expect(mobs.length).toBeGreaterThan(20);
    for (const m of mobs) {
      expect(m.level).toBeGreaterThanOrEqual(0);
      expect(m.race.length).toBeGreaterThan(0);
    }
  });

  it('rejects malformed input with a line-numbered error, never exiting', () => {
    expect(() => parseAreaFile('#BOGUS\n')).toThrow(/bad section name/);
    expect(() => parseAreaFile('#AREA\nunterminated')).toThrow(ParseError);
    expect(() => parseAreaFile('#MOBOLD\n')).toThrow(/not supported/);
  });
});

describe('parseAreaFile over the merc-mud corpus', () => {
  const mercPath = process.env.MERC_MUD_PATH ?? 'C:/Projects/merc-mud';
  const areaDir = path.join(mercPath, '2.4', 'area');
  const available = fs.existsSync(path.join(areaDir, 'area.lst'));

  (available ? it : it.skip)('parses every file listed in area.lst', () => {
    const listed = fs
      .readFileSync(path.join(areaDir, 'area.lst'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== '$');

    expect(listed.length).toBeGreaterThan(40);

    const failures: string[] = [];
    for (const file of listed) {
      try {
        parseAreaFile(fs.readFileSync(path.join(areaDir, file), 'utf8'));
      } catch (e) {
        failures.push(`${file}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
