import { cloneJson, LIMITS, type Area, type MapFile, type Room } from './schema.js';
import { area, link, room, sampleMap, subzone } from './testing/fixtures.js';
import { MAX_ERRORS, parseMapFile, validateMapFile } from './validate.js';

function mini(): MapFile {
  return {
    version: 1,
    continents: [
      {
        id: 'c1',
        name: 'C',
        areas: [
          area('a1', [
            subzone('s1', [room('r1', 'One', { exits: { N: 'l1' } }), room('r2', 'Two', { exits: { S: 'l2' } })]),
          ]),
        ],
      },
    ],
    links: [link('l1', 'r1', 'N', 'r2'), link('l2', 'r2', 'S', 'r1')],
  };
}

function errorsOf(change: (map: MapFile, rooms: Room[]) => void): string {
  const map = mini();
  change(map, map.continents[0].areas[0].subzones[0].rooms);
  const result = validateMapFile(map);
  return result.ok ? '' : result.errors.join('\n');
}

describe('validateMapFile — accepts', () => {
  it('a minimal map and the sample map, handing back the same object', () => {
    const map = mini();
    expect(validateMapFile(map)).toEqual({ ok: true, map });
    expect(validateMapFile(sampleMap()).ok).toBe(true);
  });

  it('a placement that is null, a box with a size, and a size-less box', () => {
    for (const placement of [null, { x: 0, y: 0 }, { x: -3, y: 2, w: 4, h: 2 }]) {
      const map = mini();
      map.continents[0].areas[0].placement = placement;
      expect(validateMapFile(map).ok).toBe(true);
    }
  });

  it('an alias chain that ends at a live room, and a tombstone that shares a vnum with its keeper', () => {
    const map = mini();
    const rooms = map.continents[0].areas[0].subzones[0].rooms;
    rooms.push(room('r3', 'Three', { aliasOf: 'r4', vnum: 5 }), room('r4', 'Four', { aliasOf: 'r1', vnum: 5 }));
    rooms[0].vnum = 5;
    expect(validateMapFile(map)).toEqual({ ok: true, map });
  });
});

describe('validateMapFile — rejects', () => {
  it('anything that is not an object', () => {
    for (const bad of [null, undefined, 5, 'x', [], true]) {
      const result = validateMapFile(bad);
      expect(!result.ok && result.errors[0]).toBe('map: must be an object');
    }
  });

  it('a field it does not know, at any depth', () => {
    expect(errorsOf((m) => ((m as unknown as Record<string, unknown>).extra = 1))).toMatch(/map\.extra: unknown field/);
    expect(errorsOf((_m, r) => ((r[0] as unknown as Record<string, unknown>).colour = 'red'))).toMatch(
      /rooms\[0\]\.colour: unknown field/,
    );
    expect(errorsOf((m) => ((m.links[0] as unknown as Record<string, unknown>).weight = 1))).toMatch(
      /links\[0\]\.weight: unknown field/,
    );
    expect(errorsOf((_m, r) => ((r[0].coords as unknown) = { x: 1, y: 1, w: 3 }))).toMatch(/coords\.w: unknown field/);
  });

  it('a malformed id anywhere', () => {
    expect(errorsOf((_m, r) => (r[0].id = 'Has Space'))).toMatch(/rooms\[0\]\.id: must be an id/);
    expect(errorsOf((m) => (m.continents[0].id = '<script>'))).toMatch(/continents\[0\]\.id: must be an id/);
    expect(errorsOf((m) => (m.links[0].from = 'x/y'))).toMatch(/links\[0\]\.from: must be an id/);
  });

  it('duplicate ids of every kind', () => {
    expect(errorsOf((_m, r) => (r[1].id = 'r1'))).toMatch(/duplicate room id/);
    expect(errorsOf((m) => (m.links[1].id = 'l1'))).toMatch(/duplicate link id/);
    expect(errorsOf((m) => m.continents.push({ id: 'c1', name: 'D', areas: [] }))).toMatch(/duplicate continent id/);
    expect(errorsOf((m) => m.continents[0].areas.push(area('a1', [])))).toMatch(/duplicate area id/);
    expect(errorsOf((m) => m.continents[0].areas[0].subzones.push(subzone('s1', [])))).toMatch(/duplicate subzone id/);
  });

  it('text that is missing, empty or too long', () => {
    expect(errorsOf((_m, r) => ((r[0] as unknown as Record<string, unknown>).title = undefined))).toMatch(
      /rooms\[0\]\.title: must be a string/,
    );
    expect(errorsOf((_m, r) => (r[0].title = ''))).toMatch(/title: must be 1 to 200 characters/);
    expect(errorsOf((_m, r) => (r[0].title = 'x'.repeat(201)))).toMatch(/title: must be 1 to 200 characters/);
    expect(errorsOf((_m, r) => (r[0].description = 'x'.repeat(LIMITS.description + 1)))).toMatch(
      /description: must be at most 8000 characters/,
    );
    expect(errorsOf((_m, r) => (r[0].sector = 'x'.repeat(201)))).toMatch(/sector/);
    expect(errorsOf((m) => (m.continents[0].name = ''))).toMatch(/continents\[0\]\.name/);
  });

  it('a subzone kind that is not one of the four', () => {
    expect(
      errorsOf((m) => ((m.continents[0].areas[0].subzones[0] as unknown as { kind: string }).kind = 'cave')),
    ).toMatch(/kind: must be one of consistent, maze, teleport, loop/);
  });

  it('coordinates that are not whole numbers or are out of range', () => {
    expect(errorsOf((_m, r) => (r[0].coords = { x: 1.5, y: 0 }))).toMatch(/coords\.x: must be a whole number/);
    expect(errorsOf((_m, r) => (r[0].coords = { x: 0, y: LIMITS.maxCoord + 1 }))).toMatch(/coords\.y/);
    expect(errorsOf((_m, r) => (r[0].coords = { x: 0, y: 0, z: 0.5 }))).toMatch(/coords\.z/);
  });

  it('a placement that is not a whole box', () => {
    expect(errorsOf((m) => (m.continents[0].areas[0].placement = { x: 0.5, y: 0 }))).toMatch(/placement\.x/);
    expect(errorsOf((m) => (m.continents[0].areas[0].placement = { x: 0, y: 0, w: 0 }))).toMatch(/placement\.w/);
    expect(
      errorsOf((m) => ((m.continents[0].areas[0] as unknown as Record<string, unknown>).placement = 'here')),
    ).toMatch(/placement: must be an object/);
  });

  it('a vnum that is not a game number, or that two live rooms share', () => {
    expect(errorsOf((_m, r) => (r[0].vnum = -1))).toMatch(/vnum/);
    expect(errorsOf((_m, r) => (r[0].vnum = LIMITS.maxVnum + 1))).toMatch(/vnum/);
    expect(errorsOf((_m, r) => ((r[0].vnum = 7), (r[1].vnum = 7)))).toMatch(/two live rooms share this vnum/);
  });

  it('sources with a kind it does not know or text that is too long', () => {
    expect(errorsOf((_m, r) => (r[0].sources = [{ kind: 'rumor' as never }]))).toMatch(/sources\[0\]\.kind/);
    expect(errorsOf((_m, r) => (r[0].sources = [{ kind: 'azah', credit: 'x'.repeat(201) }]))).toMatch(
      /sources\[0\]\.credit/,
    );
    expect(errorsOf((_m, r) => (r[0].sources = [{ kind: 'azah', date: 'last year' }]))).toMatch(/sources\[0\]\.date/);
    expect(
      errorsOf(
        (_m, r) => (r[0].sources = Array.from({ length: LIMITS.maxSources + 1 }, () => ({ kind: 'walked' as const }))),
      ),
    ).toMatch(/sources: has 17 entries/);
    expect(errorsOf((_m, r) => ((r[0] as unknown as Record<string, unknown>).sources = undefined))).toMatch(
      /sources: must be a list/,
    );
  });

  it('links that start or end at a room that is not in the file or is merged away', () => {
    expect(errorsOf((m) => (m.links[0].from = 'ghost'))).toMatch(/links\[0\]\.from: must be a live room/);
    expect(errorsOf((m) => (m.links[0].to = 'ghost'))).toMatch(/links\[0\]\.to: must be a live room/);
    expect(errorsOf((_m, r) => ((r[0].aliasOf = 'r2'), (r[0].exits = {})))).toMatch(
      /links\[0\]\.from: must be a live room/,
    );
  });

  it('lets a link marked off-page name a room on another page, and nothing else', () => {
    expect(errorsOf((m) => ((m.links[0].to = 'ghost'), (m.links[0].offPage = true)))).toBe('');
    expect(errorsOf((m) => ((m.links[0].to = 'ghost'), (m.links[0].offPage = false)))).toMatch(
      /links\[0\]\.to: must be a live room in the file \(or the link marked off-page\)/,
    );
    expect(errorsOf((m) => ((m.links[0].to = 'BAD ID'), (m.links[0].offPage = true)))).toMatch(
      /links\[0\]\.to: must be an id/,
    );
    // the start of a link is never off the page: it is a room of this file
    expect(errorsOf((m) => ((m.links[0].from = 'ghost'), (m.links[0].offPage = true)))).toMatch(
      /links\[0\]\.from: must be a live room/,
    );
  });

  it('a link whose target and state disagree, or whose numbers are not numbers', () => {
    expect(errorsOf((m) => (m.links[0].state = 'unknown-target'))).toMatch(
      /to: must be null exactly when the state is unknown-target/,
    );
    expect(errorsOf((m) => ((m.links[0].to = null), (m.links[0].state = 'candidate')))).toMatch(
      /to: must be null exactly/,
    );
    expect(errorsOf((m) => (m.links[0].confidence = 1.2))).toMatch(/confidence: must be a number from 0 to 1/);
    expect(errorsOf((m) => (m.links[0].confidence = Number.NaN))).toMatch(/confidence/);
    expect(errorsOf((m) => (m.links[0].traversals = -1))).toMatch(/traversals/);
    expect(errorsOf((m) => ((m.links[0] as unknown as Record<string, unknown>).offPage = 'no'))).toMatch(
      /offPage: must be true or false/,
    );
    expect(errorsOf((m) => (m.links[0].state = 'maybe' as never))).toMatch(/state: must be one of/);
    expect(errorsOf((m) => (m.links[0].dir = 'X' as never))).toMatch(/dir: must be one of/);
    expect(errorsOf((m) => (m.links[0].lastWalked = 'monday'))).toMatch(/lastWalked/);
    expect(errorsOf((m) => (m.links[0].conflictTo = Array.from({ length: 9 }, (_, i) => `r${i}`)))).toMatch(
      /conflictTo: has 9 entries/,
    );
    expect(errorsOf((m) => (m.links[0].conflictTo = ['BAD ID']))).toMatch(/conflictTo\[0\]/);
    expect(errorsOf((m) => (m.links[0].sources = [{ kind: 'nope' as never }]))).toMatch(
      /links\[0\]\.sources\[0\]\.kind/,
    );
  });

  it('exit slots and links that do not agree', () => {
    expect(errorsOf((_m, r) => (r[0].exits = { N: 'l-missing' }))).toMatch(
      /exits\.N: names a link that is not in the file/,
    );
    expect(errorsOf((_m, r) => (r[0].exits = { N: 'l2' }))).toMatch(
      /exits\.N: names a link that does not start at this room in this direction/,
    );
    expect(errorsOf((_m, r) => (r[0].exits = {}))).toMatch(/link l1: is not in its room's exit slot/);
    expect(errorsOf((_m, r) => ((r[0].exits as Record<string, string>).Q = 'l1'))).toMatch(/exits\.Q: unknown field/);
    expect(errorsOf((_m, r) => ((r[0].exits as Record<string, unknown>).N = 5))).toMatch(/exits\.N: must be an id/);
  });

  it('an alias to a missing room, a loop, a long chain, and a merged-away room with exits', () => {
    expect(errorsOf((_m, r) => ((r[1].aliasOf = 'ghost'), (r[1].exits = {})))).toMatch(
      /aliasOf names a room that is not in the file/,
    );
    expect(
      errorsOf((m, r) => {
        r.push(room('r3', 'Three', { aliasOf: 'r4' }), room('r4', 'Four', { aliasOf: 'r3' }));
        void m;
      }),
    ).toMatch(/does not end at a live room/);
    expect(
      errorsOf((_m, r) => {
        for (let i = 0; i < 20; i += 1) r.push(room(`t${i}`, `T${i}`, { aliasOf: i === 19 ? 'r1' : `t${i + 1}` }));
      }),
    ).toMatch(/does not end at a live room/);
    expect(errorsOf((_m, r) => (r[0].aliasOf = 'r2'))).toMatch(/a merged-away room has no exits/);
  });

  it('too many continents, areas, subzones and rooms', () => {
    const emptyArea = (id: string): Area => area(id, []);
    const areas = validateMapFile({
      ...mini(),
      continents: [0, 1].map((c) => ({
        id: `c${c}`,
        name: 'C',
        areas: Array.from({ length: LIMITS.maxAreas / 2 + 1 }, (_, i) => emptyArea(`a${c}-${i}`)),
      })),
    });
    expect(!areas.ok && areas.errors.join('\n')).toMatch(/more than 4000 areas in the file/);

    const subzones = validateMapFile({
      ...mini(),
      continents: [
        {
          id: 'c1',
          name: 'C',
          areas: [0, 1].map((a) =>
            area(
              `a${a}`,
              Array.from({ length: LIMITS.maxSubzones / 2 + 1 }, (_, i) => subzone(`s${a}-${i}`, [])),
            ),
          ),
        },
      ],
    });
    expect(!subzones.ok && subzones.errors.join('\n')).toMatch(/more than 20000 subzones in the file/);

    const perZone = 9_000;
    const zones = Array.from({ length: 7 }, (_, z) =>
      subzone(
        `s${z}`,
        Array.from({ length: perZone }, (_, i) => room(`r${z}-${i}`, 'X')),
      ),
    );
    const rooms = validateMapFile({
      ...mini(),
      links: [],
      continents: [{ id: 'c1', name: 'C', areas: [area('a1', zones)] }],
    });
    expect(!rooms.ok && rooms.errors.join('\n')).toMatch(/more than 60000 rooms in the file/);

    const oneList = validateMapFile({
      ...mini(),
      links: Array.from({ length: LIMITS.maxLinks + 1 }, () => mini().links[0]),
    });
    expect(!oneList.ok && oneList.errors[0]).toMatch(/map\.links: has 240001 entries/);
  });

  it('a baseline that cannot be true', () => {
    const base = (): NonNullable<Room['baseline']> => ({
      visits: 3,
      days: ['2026-11-01'],
      contents: [
        {
          label: 'a rat',
          kind: 'mob',
          status: 'transient',
          seen: 2,
          observed: 3,
          count: 1,
          days: ['2026-11-01'],
          firstSeen: '2026-11-01',
          lastSeen: '2026-11-01',
          missed: 0,
          returns: 0,
        },
      ],
      was: [],
    });
    expect(errorsOf((_m, r) => (r[0].baseline = base()))).toBe('');
    expect(errorsOf((_m, r) => ((r[0].baseline = base()), (r[0].baseline.contents[0].seen = 4)))).toMatch(
      /seen: cannot exceed observed/,
    );
    expect(
      errorsOf((_m, r) => ((r[0].baseline = base()), (r[0].baseline.contents[0].kind = 'dragon' as never))),
    ).toMatch(/contents\[0\]\.kind/);
    expect(
      errorsOf((_m, r) => ((r[0].baseline = base()), (r[0].baseline.contents[0].status = 'maybe' as never))),
    ).toMatch(/contents\[0\]\.status/);
    expect(errorsOf((_m, r) => ((r[0].baseline = base()), (r[0].baseline.days = ['x'])))).toMatch(
      /baseline\.days\[0\]/,
    );
    expect(errorsOf((_m, r) => ((r[0].baseline = base()), (r[0].baseline.visits = -1)))).toMatch(/baseline\.visits/);
    expect(
      errorsOf(
        (_m, r) => (
          (r[0].baseline = base()),
          (r[0].baseline.contents = Array.from({ length: 65 }, () => base().contents[0]))
        ),
      ),
    ).toMatch(/contents: has 65 entries/);
    expect(
      errorsOf((_m, r) => {
        r[0].baseline = base();
        r[0].baseline.was = [
          {
            label: 'a rat',
            kind: 'mob',
            seen: 5,
            observed: 5,
            count: 1,
            firstSeen: '2026-11-01',
            lastSeen: '2026-11-02',
            demotedOn: 'soon',
            returns: 0,
          },
        ];
      }),
    ).toMatch(/was\[0\]\.demotedOn/);
    expect(
      errorsOf(
        (_m, r) => ((r[0].baseline = base()), ((r[0].baseline as unknown as Record<string, unknown>).extra = 1)),
      ),
    ).toMatch(/baseline\.extra: unknown field/);
  });

  it('history entries that are malformed, and undo images that are not links', () => {
    expect(errorsOf((_m, r) => (r[0].history = [{ at: '2026-11-07', op: 'bless' as never }]))).toMatch(
      /history\[0\]\.op/,
    );
    expect(errorsOf((_m, r) => (r[0].history = [{ at: 'later', op: 'merge' }]))).toMatch(/history\[0\]\.at/);
    expect(errorsOf((_m, r) => (r[0].history = [{ at: '2026-11-07', op: 'merge', with: ['BAD ID'] }]))).toMatch(
      /with\[0\]/,
    );
    expect(errorsOf((_m, r) => (r[0].history = [{ at: '2026-11-07', op: 'merge', note: 'x'.repeat(201) }]))).toMatch(
      /history\[0\]\.note/,
    );
    expect(
      errorsOf(
        (_m, r) =>
          (r[0].history = Array.from({ length: LIMITS.maxHistory + 1 }, () => ({
            at: '2026-11-07',
            op: 'create' as const,
          }))),
      ),
    ).toMatch(/history: has 65 entries/);
    const undo = (patch: Record<string, unknown>): Room['history'] => [
      {
        at: '2026-11-07',
        op: 'merge',
        undo: {
          absorbed: 'r2',
          moved: [],
          dropped: [],
          changed: [],
          absorbedExits: {},
          keptBaseline: null,
          keptExits: {},
          ...patch,
        } as never,
      },
    ];
    expect(errorsOf((_m, r) => (r[0].history = undo({})))).toBe('');
    expect(errorsOf((_m, r) => (r[0].history = undo({ absorbed: 'BAD ID' })))).toMatch(/undo\.absorbed/);
    expect(errorsOf((_m, r) => (r[0].history = undo({ moved: [{ link: 'l1', end: 'middle' }] })))).toMatch(
      /undo\.moved\[0\]\.end/,
    );
    expect(errorsOf((_m, r) => (r[0].history = undo({ moved: [{ link: 'BAD ID', end: 'from' }] })))).toMatch(
      /undo\.moved\[0\]\.link/,
    );
    expect(errorsOf((_m, r) => (r[0].history = undo({ dropped: [{ id: 'l9' }] })))).toMatch(/undo\.dropped\[0\]/);
    expect(errorsOf((_m, r) => (r[0].history = undo({ changed: ['nope'] })))).toMatch(
      /undo\.changed\[0\]: must be an object/,
    );
    expect(errorsOf((_m, r) => (r[0].history = undo({ keptExits: { N: 'BAD ID' } })))).toMatch(/keptExits\.N/);
    expect(
      errorsOf((_m, r) => (r[0].history = undo({ keptBaseline: { visits: -1, days: [], contents: [], was: [] } }))),
    ).toMatch(/keptBaseline\.visits/);
    expect(errorsOf((_m, r) => (r[0].history = undo({ extra: 1 })))).toMatch(/undo\.extra: unknown field/);
  });

  it('a list where an object belongs, and the other way round', () => {
    expect(errorsOf((m) => ((m as unknown as Record<string, unknown>).continents = {}))).toMatch(
      /map\.continents: must be a list/,
    );
    expect(errorsOf((m) => ((m.continents[0] as unknown as Record<string, unknown>).areas = 'none'))).toMatch(
      /areas: must be a list/,
    );
    expect(errorsOf((m) => ((m.continents[0].areas[0] as unknown) = [1]))).toMatch(/areas\[0\]: must be an object/);
    expect(errorsOf((m) => (m.generatedAt = 'sometime'))).toMatch(/map\.generatedAt: must be a date/);
  });

  it('a value of the wrong kind at every level of nesting, without throwing', () => {
    const garbage: [string, (m: MapFile, r: Room[]) => void, RegExp][] = [
      [
        'a continent that is a number',
        (m) => ((m.continents as unknown[])[0] = 5),
        /continents\[0\]: must be an object/,
      ],
      [
        'a subzone that is a list',
        (m) => ((m.continents[0].areas[0].subzones as unknown[])[0] = []),
        /subzones\[0\]: must be an object/,
      ],
      ['a room that is text', (_m, r) => ((r as unknown[])[0] = 'r1'), /rooms\[0\]: must be an object/],
      ['a link that is null', (m) => ((m.links as unknown[])[0] = null), /links\[0\]: must be an object/],
      [
        'coordinates that are a number',
        (_m, r) => ((r[0] as unknown as Record<string, unknown>).coords = 5),
        /coords: must be an object/,
      ],
      [
        'a baseline that is a list',
        (_m, r) => ((r[0] as unknown as Record<string, unknown>).baseline = []),
        /baseline: must be an object/,
      ],
      [
        'a content entry that is text',
        (_m, r) => (r[0].baseline = { visits: 1, days: [], contents: ['rat'] as never, was: [] }),
        /contents\[0\]: must be an object/,
      ],
      [
        'a was entry that is text',
        (_m, r) => (r[0].baseline = { visits: 1, days: [], contents: [], was: [3] as never }),
        /was\[0\]: must be an object/,
      ],
      ['a history entry that is text', (_m, r) => (r[0].history = ['x'] as never), /history\[0\]: must be an object/],
      ['a source that is text', (_m, r) => (r[0].sources = ['walked'] as never), /sources\[0\]: must be an object/],
      [
        'an undo image that is text',
        (_m, r) => (r[0].history = [{ at: '2026-11-07', op: 'merge', undo: 'x' as never }]),
        /undo: must be an object/,
      ],
      [
        'an undo moved entry that is text',
        (_m, r) =>
          (r[0].history = [
            {
              at: '2026-11-07',
              op: 'merge',
              undo: {
                absorbed: 'r2',
                moved: ['x'],
                dropped: [],
                changed: [],
                absorbedExits: {},
                keptBaseline: null,
                keptExits: {},
              } as never,
            },
          ]),
        /moved\[0\]: must be an object/,
      ],
      [
        'an exit map that is a list',
        (_m, r) => ((r[0] as unknown as Record<string, unknown>).exits = []),
        /exits: must be an object/,
      ],
      [
        'an alias that is not an id',
        (_m, r) => ((r[1].aliasOf = 'BAD ID'), (r[1].exits = {})),
        /aliasOf: must be an id/,
      ],
      [
        'an area id that is not an id',
        (m) => (m.continents[0].areas[0].id = 'BAD ID'),
        /areas\[0\]\.id: must be an id/,
      ],
      [
        'a subzone id that is not an id',
        (m) => (m.continents[0].areas[0].subzones[0].id = 'BAD ID'),
        /subzones\[0\]\.id: must be an id/,
      ],
    ];
    for (const [name, change, expected] of garbage) {
      const text = errorsOf(change);
      expect({ name, text }).toEqual({ name, text: expect.stringMatching(expected) });
    }
  });

  it('a link id that is not text, without throwing', () => {
    expect(errorsOf((m) => ((m.links[0] as unknown as Record<string, unknown>).id = 5))).toMatch(
      /links\[0\]\.id: must be an id/,
    );
  });

  it('accepts sources on an area, and a link with its own sources', () => {
    const map = mini();
    map.continents[0].areas[0].sources = [{ kind: 'azah', ref: '12', credit: 'Azah', date: '2020-05-01' }];
    map.links[0].sources = [{ kind: 'walked', date: '2026-11-07T10:00:00Z' }];
    expect(validateMapFile(map).ok).toBe(true);
  });

  it('reports at most the error cap, each with its path', () => {
    const map = mini();
    const rooms = map.continents[0].areas[0].subzones[0].rooms;
    for (let i = 0; i < 40; i += 1) rooms.push(room(`x${i}`, '', { exits: {} }));
    const result = validateMapFile(map);
    expect(result.ok).toBe(false);
    const errors = !result.ok ? result.errors : [];
    expect(errors).toHaveLength(MAX_ERRORS);
    expect(errors[0]).toMatch(/^map\.continents\[0\]\.areas\[0\]\.subzones\[0\]\.rooms\[2\]\.title: /);
  });

  it('never changes the value it checks', () => {
    const map = sampleMap();
    const snapshot = cloneJson(map);
    validateMapFile(map);
    expect(map).toEqual(snapshot);
  });
});

describe('parseMapFile', () => {
  it('reads text, and says so when it is not JSON or not text', () => {
    expect(parseMapFile(JSON.stringify(mini())).ok).toBe(true);
    expect(parseMapFile('{not json')).toEqual({ ok: false, errors: ['map: not valid JSON'] });
    expect(parseMapFile(undefined as never)).toEqual({ ok: false, errors: ['map: must be text'] });
  });
});
