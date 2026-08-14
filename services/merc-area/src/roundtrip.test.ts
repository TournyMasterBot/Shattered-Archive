import fs from 'fs';
import path from 'path';

import { parseAreaFile } from './parse.js';
import { emitAreaFile } from './emit.js';
import type { AreaFile } from './types.js';

// Resolve fixtures from the test file, not cwd — the root jest config runs this suite too.
const here = __dirname;

/**
 * The core guarantee of this library: for any file db.c can boot,
 *   parse(emit(parse(text))) deep-equals parse(text)   (semantic round trip)
 * and
 *   emit(parse(emit(model))) === emit(model)           (emission is stable).
 */
function assertRoundTrip(name: string, text: string): void {
  const first = parseAreaFile(text);
  const emitted = emitAreaFile(first);
  let second;
  try {
    second = parseAreaFile(emitted);
  } catch (e) {
    throw new Error(`${name}: emitted output failed to re-parse: ${(e as Error).message}`);
  }
  expect(second).toEqual(first);
  expect(emitAreaFile(second)).toBe(emitted);
}

describe('round trip on fixtures', () => {
  for (const name of ['limbo.are', 'midgaard.are']) {
    it(`round-trips ${name}`, () => {
      assertRoundTrip(name, fs.readFileSync(path.join(here, '__fixtures__', name), 'utf8'));
    });
  }
});

describe('diagonal doors (Phase 12b rose)', () => {
  it('round-trips D6-D9 exits byte-identically and rejects door 10', () => {
    const text = `#AREA
rose.are~
Rose~
{ 1 50} Test  Rose~
100 199

#ROOMS
#110
Corner Room~
A room with diagonal exits.
~
0 0 0
D6
~
~
0 0 111
D9
~
~
0 0 112
S
#111
Northeast Room~
Up and to the right.
~
0 0 0
D9
~
~
0 0 110
S
#112
Southwest Room~
Down and to the left.
~
0 0 0
D6
~
~
0 0 110
S
#0

#$
`;
    assertRoundTrip('rose.are', text);
    const parsed = parseAreaFile(text);
    const rooms = parsed.sections.find((s) => s.kind === 'rooms');
    expect(rooms && rooms.kind === 'rooms' ? rooms.rooms[0].exits.map((e) => e.door) : []).toEqual([6, 9]);
    expect(() => parseAreaFile(text.replace('D6', 'D10'))).toThrow(/bad door number 10/);
  });
});

describe('flag letter form', () => {
  it('emits flag vectors as letters; decimal only when letters cannot express them', () => {
    const area: AreaFile = {
      sections: [
        {
          kind: 'objects',
          objects: [
            {
              vnum: 1,
              name: 'test',
              shortDescr: 'a test',
              description: 'A test lies here.',
              material: 'iron',
              itemType: 'armor',
              extraFlags: 1 + 2 + 2 ** 30, // A + B + bit 30 = 'e'
              wearFlags: 0,
              values: [0, 0, 0, 0, 0],
              level: 1,
              weight: 1,
              cost: 0,
              condition: 'P',
              affects: [],
              flagAffects: [{ where: 'A', location: 0, modifier: 0, bitvector: -5 }],
              extraDescrs: [],
            },
          ],
        },
      ],
    };
    const text = emitAreaFile(area);
    expect(text).toContain('armor ABe 0\n'); // letters for set bits, '0' when empty
    expect(text).toContain('F A 0 0 -5\n'); // negative vectors stay decimal
    expect(parseAreaFile(text)).toEqual(area); // fread_flag reads it back losslessly
  });
});

describe('round trip over the merc-mud corpus', () => {
  const mercPath = process.env.MERC_MUD_PATH ?? 'C:/Projects/merc-mud';
  const areaDir = path.join(mercPath, '2.4', 'area');
  const available = fs.existsSync(path.join(areaDir, 'area.lst'));

  (available ? it : it.skip)('round-trips every file listed in area.lst', () => {
    const listed = fs
      .readFileSync(path.join(areaDir, 'area.lst'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== '$');

    const failures: string[] = [];
    for (const file of listed) {
      try {
        assertRoundTrip(file, fs.readFileSync(path.join(areaDir, file), 'utf8'));
      } catch (e) {
        failures.push(`${file}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
