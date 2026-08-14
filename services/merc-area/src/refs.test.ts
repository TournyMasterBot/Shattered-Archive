/**
 * validateRefs / referencesTo — vnum reference integrity. The corpus sweep is
 * the load-bearing check: no stock file may report save-blocking errors,
 * otherwise the server's requireValidRefs would reject untouched areas.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseAreaFile } from './parse.js';
import { collectDefinedEntities, referencesTo, validateRefs } from './validate.js';
import type { AreaFile } from './types.js';

const FIXTURES = join(__dirname, '__fixtures__');
const MUD_AREA_DIR = 'C:/Projects/merc-mud/2.4/area';

function tinyArea(extraSections = ''): AreaFile {
  return parseAreaFile(`#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#MOBILES
#101
guard test~
the test guard~
A test guard stands here.
~
He looks thoroughly bored.
~
human~
A 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
#0

#OBJECTS
#102
sword test~
a test sword~
A test sword lies here.~
steel~
weapon A AN
sword 1 6 slash 0
5 10 100 P
#0

#ROOMS
#110
Test Room~
A test room.
~
0 0 0
D0
~
~
0 0 111
S
#111
Second Room~
Another test room.
~
0 0 0
S
#0

#RESETS
M 0 101 1 110 1
G 0 102 1
O 0 102 0 111
S

${extraSections}#$
`);
}

const SHOP_101 = `#SHOPS
 101   0 0 0 0 0   100 100   0 23        ; the test guard
0

`;

const SPECIAL_101 = `#SPECIALS
M  101 spec_guard
S

`;

describe('validateRefs', () => {
  it('accepts a fully linked file (no errors, no warnings)', () => {
    const r = validateRefs(tinyArea());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.refs.length).toBeGreaterThan(0);
  });

  it('flags in-range references to missing entities as errors, naming the source', () => {
    const area = tinyArea();
    // Drop mob 101: the M reset and nothing else should turn into an error.
    area.sections = area.sections.map((s) => (s.kind === 'mobiles' ? { ...s, mobiles: [] } : s));
    const r = validateRefs(area);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('reset #1 (M)');
    expect(r.errors[0]).toContain('mob 101');
  });

  it('treats out-of-range references as cross-area warnings, not errors', () => {
    const area = tinyArea();
    for (const s of area.sections) {
      if (s.kind === 'rooms') s.rooms[0].exits[0].toVnum = 3001; // outside 100-199
    }
    const r = validateRefs(area);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('room 3001') && w.includes('another area'))).toBe(true);
  });

  it('with a resolver: proven cross-area refs become external links, unresolved ones real warnings', () => {
    const area = tinyArea();
    for (const s of area.sections) {
      if (s.kind === 'rooms') {
        s.rooms[0].exits[0].toVnum = 3001; // resolvable elsewhere
        s.rooms[1].exits = [
          { door: 0, description: '', keyword: '', locks: 0, key: 0, toVnum: 9999 }, // resolves nowhere
        ];
      }
    }
    const resolveExternal = (kind: string, vnum: number) =>
      kind === 'room' && vnum === 3001 ? { file: 'midgaard.are', name: 'The Temple Square' } : null;
    const r = validateRefs(area, { resolveExternal });
    expect(r.errors).toEqual([]);
    expect(r.external).toEqual([
      expect.objectContaining({ kind: 'room', vnum: 3001, file: 'midgaard.are', name: 'The Temple Square' }),
    ]);
    // 3001 resolved — no warning for it; 9999 resolved nowhere — a REAL warning.
    expect(r.warnings.some((w) => w.includes('3001'))).toBe(false);
    expect(r.warnings.some((w) => w.includes('room 9999') && w.includes('any listed area'))).toBe(true);
  });

  it('with a resolver: in-range hard refs stay ERRORS even when another file defines the vnum (overlap smell)', () => {
    const area = tinyArea();
    area.sections = area.sections.map((s) => (s.kind === 'mobiles' ? { ...s, mobiles: [] } : s));
    const r = validateRefs(area, {
      resolveExternal: () => ({ file: 'other.are', name: 'an impostor guard' }),
    });
    expect(r.errors.some((e) => e.includes('mob 101'))).toBe(true);
    expect(r.external).toEqual([]);
  });

  it('collectDefinedEntities lists every mob/object/room with its display name', () => {
    const entities = collectDefinedEntities(tinyArea());
    expect(entities).toEqual(
      expect.arrayContaining([
        { kind: 'mob', vnum: 101, name: 'the test guard' },
        { kind: 'object', vnum: 102, name: 'a test sword' },
        { kind: 'room', vnum: 110, name: 'Test Room' },
        { kind: 'room', vnum: 111, name: 'Second Room' },
      ]),
    );
  });

  it('treats dangling exit KEY vnums as warnings even in range (stock files ship these)', () => {
    const area = tinyArea();
    for (const s of area.sections) {
      if (s.kind === 'rooms') s.rooms[0].exits[0].key = 150; // in range, not defined
    }
    const r = validateRefs(area);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('key object 150'))).toBe(true);
  });
});

describe('shop/special semantics (Phase 5)', () => {
  it('accepts a well-formed shop and special', () => {
    const r = validateRefs(tinyArea(SHOP_101 + SPECIAL_101));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('errors on a duplicate shop for the same keeper', () => {
    const dup = SHOP_101.replace('0\n\n', ' 101   0 0 0 0 0   150 90   0 23\n0\n\n');
    const r = validateRefs(tinyArea(dup));
    expect(r.errors.some((e) => e.includes('duplicate shop for keeper mob 101'))).toBe(true);
  });

  it('errors on an unknown spec_fun (boot-fatal in the game)', () => {
    const r = validateRefs(tinyArea(SPECIAL_101.replace('spec_guard', 'spec_bogus')));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("unknown spec_fun 'spec_bogus' on mob 101");
  });

  it('accepts a prefix of a known spec_fun, like spec_lookup does', () => {
    const r = validateRefs(tinyArea(SPECIAL_101.replace('spec_guard', 'spec_gu')));
    expect(r.errors).toEqual([]);
  });

  it('warns (not errors) when a mob has two spec_funs — last wins in the game', () => {
    const dup = SPECIAL_101.replace('S\n\n', 'M  101 spec_thief\nS\n\n');
    const r = validateRefs(tinyArea(dup));
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('mob 101 has more than one spec_fun'))).toBe(true);
  });

  it('flags a shop whose keeper is missing in-range (existing ref check still covers shops)', () => {
    const r = validateRefs(tinyArea(SHOP_101.replace(/101/g, '155')));
    expect(r.errors.some((e) => e.includes('keeper mob 155'))).toBe(true);
  });
});

describe('referencesTo (delete-blocking reverse index)', () => {
  it('finds every reference to an entity', () => {
    const area = tinyArea();
    const mobRefs = referencesTo(area, 'mob', 101);
    expect(mobRefs).toHaveLength(1);
    expect(mobRefs[0].where).toContain('reset #1 (M)');

    const objRefs = referencesTo(area, 'object', 102);
    expect(objRefs.map((r) => r.where).join('; ')).toContain('reset #2 (G)');
    expect(objRefs).toHaveLength(2); // G and O resets

    const roomRefs = referencesTo(area, 'room', 111);
    expect(roomRefs).toHaveLength(2); // exit from 110 + O reset
  });

  it('returns empty for an unreferenced entity', () => {
    expect(referencesTo(tinyArea(), 'room', 110).length).toBeGreaterThan(0); // M reset target
    const area = tinyArea();
    area.sections = area.sections.map((s) => (s.kind === 'resets' ? { ...s, resets: [] } : s));
    expect(referencesTo(area, 'mob', 101)).toEqual([]);
  });
});

describe('corpus sweep', () => {
  const files = (() => {
    try {
      return readFileSync(join(MUD_AREA_DIR, 'area.lst'), 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l !== '' && l !== '$');
    } catch {
      return readdirSync(FIXTURES).filter((f) => f.endsWith('.are'));
    }
  })();

  it('reports no save-blocking errors for any stock area file', () => {
    const offenders: string[] = [];
    for (const f of files) {
      let text: string;
      try {
        text = readFileSync(join(MUD_AREA_DIR, f), 'utf8');
      } catch {
        text = readFileSync(join(FIXTURES, f), 'utf8');
      }
      const r = validateRefs(parseAreaFile(text));
      if (r.errors.length > 0) offenders.push(`${f}: ${r.errors[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('D/R reset bounds (Phase 12b — db.c load_resets is exit(1) on violation)', () => {
  const areaWithResets = (resetLines: string) =>
    parseAreaFile(`#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#ROOMS
#110
Test Room~
A test room.
~
0 0 0
D6
door~
door~
1 0 111
S
#111
Second Room~
Another test room.
~
0 0 0
S
#0

#RESETS
${resetLines}
S

#$
`);

  it('accepts a D reset on a diagonal door and an R covering all 10 exits', () => {
    const r = validateRefs(areaWithResets('D 0 110 6 1\nR 0 110 10'));
    expect(r.errors).toEqual([]);
  });

  it('blocks a D reset with door 10+', () => {
    const r = validateRefs(areaWithResets('D 0 110 12 1'));
    expect(r.errors.some((e) => e.includes('bad exit 12'))).toBe(true);
  });

  it('blocks a D reset with bad locks and an R with count over 10', () => {
    const r = validateRefs(areaWithResets('D 0 110 6 5\nR 0 110 11'));
    expect(r.errors.some((e) => e.includes('bad locks 5'))).toBe(true);
    expect(r.errors.some((e) => e.includes('bad exit count 11'))).toBe(true);
  });
});
