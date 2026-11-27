import { cloneJson, emptyMap, type ContentKind, type ContentRecord, type MapFile, type WasRecord } from '../schema.js';
import { validateMapFile } from '../validate.js';
import { room, sampleMap } from '../testing/fixtures.js';
import { publishAudited, publishFileName, PUBLISH_SLUG } from './audited.js';

const DAY = '2026-11-08';

function content(label: string, kind: ContentKind): ContentRecord {
  return {
    label,
    kind,
    status: 'fixture',
    seen: 5,
    observed: 5,
    count: 1,
    days: ['2026-11-01'],
    firstSeen: '2026-11-01',
    lastSeen: '2026-11-07',
    missed: 0,
    returns: 0,
  };
}

function was(label: string, kind: ContentKind): WasRecord {
  return {
    label,
    kind,
    seen: 4,
    observed: 6,
    count: 1,
    firstSeen: '2026-10-01',
    lastSeen: '2026-10-20',
    demotedOn: '2026-10-25',
    returns: 0,
  };
}

function findRoom(map: MapFile, id: string) {
  for (const c of map.continents)
    for (const a of c.areas) for (const s of a.subzones) for (const r of s.rooms) if (r.id === id) return r;
  throw new Error(`no room ${id}`);
}

describe('publishAudited', () => {
  it('slices the sample map into one valid file per area, named after the area', () => {
    const result = publishAudited(sampleMap(), { publishedAt: DAY });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.areas.map((a) => [a.areaId, a.continentId, a.fileName])).toEqual([
      ['town', 'c1', 'town.json.gz'],
      ['forest', 'c1', 'forest.json.gz'],
    ]);
    for (const area of result.areas) expect(validateMapFile(area.map).ok).toBe(true);
    expect(publishFileName('az-a100')).toBe('az-a100.json.gz');
  });

  it('writes a manifest with the counts, the areas and the continents', () => {
    const result = publishAudited(sampleMap(), { publishedAt: DAY });
    const m = result.manifest!;
    expect(m.version).toBe(1);
    expect(m.status).toBe('audited');
    expect(m.publishedAt).toBe(DAY);
    expect(m.counts).toEqual({ continents: 1, areas: 2, subzones: 2, rooms: 6, links: 7, offPageLinks: 1 });
    expect(m.continents).toEqual([{ id: 'c1', name: 'Test Continent', areas: 2, rooms: 6 }]);
    expect(m.areas.map((a) => [a.id, a.file, a.rooms, a.links, a.offPageLinks])).toEqual([
      ['town', 'town.json.gz', 5, 7, 1],
      ['forest', 'forest.json.gz', 1, 0, 0],
    ]);
    expect(m.areas[0].placement).toEqual({ x: 0, y: 0, w: 2, h: 1 });
    expect(m.areas[1].placement).toBeNull();
  });

  it('lists the exits between areas in the manifest, so a continent can draw its lines without loading every area', () => {
    const m = publishAudited(sampleMap(), { publishedAt: DAY }).manifest!;
    expect(m.areaLinks.length).toBeGreaterThan(0);
    for (const l of m.areaLinks) {
      expect(l.from).not.toBe(l.to);
      expect(m.areas.map((a) => a.id)).toEqual(expect.arrayContaining([l.from, l.to]));
      expect(l.count).toBeGreaterThan(0);
    }
    expect(publishAudited({ version: 1, continents: [], links: [] }, { publishedAt: DAY }).manifest!.areaLinks).toEqual([]);
  });

  it('puts each link in the slice of the area its exit starts in, and keeps the file date', () => {
    const result = publishAudited(sampleMap(), { publishedAt: DAY });
    const town = result.areas[0].map;
    const forest = result.areas[1].map;
    expect(town.links.map((l) => l.id).sort()).toEqual(
      ['l-r1-e', 'l-r1-n', 'l-r1-s', 'l-r2-s', 'l-r2-w', 'l-r3-d', 'l-r4-e'].sort(),
    );
    expect(forest.links).toEqual([]);
    expect(town.generatedAt).toBe('2026-11-07');
    expect(town.continents).toHaveLength(1);
    expect(town.continents[0].areas.map((a) => a.id)).toEqual(['town']);
  });

  it('marks a link off-page exactly when its target is in another area, whatever the input says', () => {
    const map = sampleMap();
    map.links.find((l) => l.id === 'l-r4-e')!.offPage = false; // leads to the forest, but the input forgot to say so
    map.links.find((l) => l.id === 'l-r1-e')!.offPage = true; // stays in the town, but the input says it leaves
    const town = publishAudited(map, { publishedAt: DAY }).areas[0].map;
    expect(town.links.find((l) => l.id === 'l-r4-e')!.offPage).toBe(true);
    expect(town.links.find((l) => l.id === 'l-r1-e')!.offPage).toBe(false);
    expect(town.links.find((l) => l.id === 'l-r1-n')!.offPage).toBe(false); // unknown target: nothing to leave to
  });

  it('marks a link to a room that is in no area of the map off-page too', () => {
    const map = sampleMap();
    const l = map.links.find((x) => x.id === 'l-r4-e')!;
    l.to = 'elsewhere';
    l.offPage = true;
    const result = publishAudited(map, { publishedAt: DAY });
    expect(result.ok).toBe(true);
    expect(result.areas[0].map.links.find((x) => x.id === 'l-r4-e')).toMatchObject({ to: 'elsewhere', offPage: true });
  });

  it('does not change the input', () => {
    const map = sampleMap();
    findRoom(map, 'r1').history = [{ at: DAY, op: 'create' }];
    const before = JSON.stringify(map);
    publishAudited(map, { publishedAt: DAY });
    expect(JSON.stringify(map)).toBe(before);
  });

  it('leaves out room history and counts it', () => {
    const map = sampleMap();
    findRoom(map, 'r1').history = [{ at: DAY, op: 'create', note: 'internal' }];
    findRoom(map, 'r6').history = [{ at: DAY, op: 'create' }];
    const result = publishAudited(map, { publishedAt: DAY });
    expect(findRoom(result.areas[0].map, 'r1').history).toBeUndefined();
    expect(findRoom(result.areas[1].map, 'r6').history).toBeUndefined();
    expect(JSON.stringify(result.areas)).not.toContain('internal');
    expect(result.report.roomHistoriesDropped).toBe(2);
  });

  it('leaves out player records from a baseline and its was list, and keeps mobs, items and the rest', () => {
    const map = sampleMap();
    findRoom(map, 'r2').baseline = {
      visits: 9,
      days: ['2026-11-01', '2026-11-07'],
      contents: [
        content('a town guard', 'mob'),
        content('a hooded visitor', 'player'),
        content('a rusty lamp', 'item'),
      ],
      was: [was('a former stranger', 'player'), was('a stray dog', 'mob')],
    };
    const result = publishAudited(map, { publishedAt: DAY });
    const baseline = findRoom(result.areas[0].map, 'r2').baseline!;
    expect(baseline.contents.map((c) => c.label)).toEqual(['a town guard', 'a rusty lamp']);
    expect(baseline.was.map((w) => w.label)).toEqual(['a stray dog']);
    expect(baseline.visits).toBe(9);
    expect(baseline.days).toEqual(['2026-11-01', '2026-11-07']);
    expect(JSON.stringify(result.areas)).not.toContain('hooded visitor');
    expect(JSON.stringify(result.areas)).not.toContain('former stranger');
    expect(result.report.playerRecordsDropped).toBe(2);
    expect(findRoom(map, 'r2').baseline!.contents).toHaveLength(3); // the input still has them
  });

  it('collects the distinct credits of rooms, links and areas, sorted', () => {
    const map = sampleMap();
    findRoom(map, 'r1').sources = [{ kind: 'azah', ref: '12', credit: 'Zed', date: '2026-01-02' }, { kind: 'walked' }];
    findRoom(map, 'r2').sources = [{ kind: 'azah', ref: '13', credit: 'Azah' }];
    findRoom(map, 'r6').sources = [{ kind: 'azah', ref: '14', credit: 'Azah' }];
    map.links.find((l) => l.id === 'l-r1-s')!.sources = [{ kind: 'manual', credit: 'Mox' }];
    map.continents[0].areas[1].sources = [{ kind: 'manual', credit: 'Ada' }];
    const result = publishAudited(map, { publishedAt: DAY });
    expect(result.manifest!.credits).toEqual(['Ada', 'Azah', 'Mox', 'Zed']);
  });

  it('has no credits when no source names one', () => {
    expect(publishAudited(sampleMap(), { publishedAt: DAY }).manifest!.credits).toEqual([]);
  });

  it('publishes an empty map as an empty manifest', () => {
    const result = publishAudited(emptyMap(DAY), { publishedAt: DAY });
    expect(result.ok).toBe(true);
    expect(result.areas).toEqual([]);
    expect(result.manifest!.counts).toEqual({
      continents: 0,
      areas: 0,
      subzones: 0,
      rooms: 0,
      links: 0,
      offPageLinks: 0,
    });
  });

  it('publishes a map with no generatedAt', () => {
    const map = sampleMap();
    delete map.generatedAt;
    const result = publishAudited(map, { publishedAt: DAY });
    expect(result.ok).toBe(true);
    expect('generatedAt' in result.areas[0].map).toBe(false);
  });

  it('counts a continent that has no area', () => {
    const map = sampleMap();
    map.continents.push({ id: 'c2', name: 'Empty Shore', areas: [] });
    const result = publishAudited(map, { publishedAt: DAY });
    expect(result.manifest!.continents).toEqual([
      { id: 'c1', name: 'Test Continent', areas: 2, rooms: 6 },
      { id: 'c2', name: 'Empty Shore', areas: 0, rooms: 0 },
    ]);
    expect(result.manifest!.counts.continents).toBe(2);
  });

  describe('refusals', () => {
    it.each(['', 'yesterday', '2026-13', '08-11-2026'])('refuses the date "%s"', (date) => {
      const result = publishAudited(sampleMap(), { publishedAt: date });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain('is not a date');
      expect(result.manifest).toBeNull();
      expect(result.areas).toEqual([]);
    });

    it('refuses a file the strict reader refuses, naming the finding', () => {
      const map = cloneJson(sampleMap());
      map.links.push({ ...map.links[0], id: 'l-r1-e' }); // a duplicate link id
      const result = publishAudited(map, { publishedAt: DAY });
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.startsWith('the audited file:') && e.includes('duplicate link id'))).toBe(
        true,
      );
    });

    it('refuses something that is not a map', () => {
      const result = publishAudited({} as unknown as MapFile, { publishedAt: DAY });
      expect(result.ok).toBe(false);
      expect(result.manifest).toBeNull();
    });

    it.each([
      ['an id with a dot', 'town.one'],
      ['an id with a colon', 'town:one'],
      ['a doubled hyphen', 'town--one'],
      ['a trailing hyphen', 'town-'],
      ['an underscore', 'town_one'],
    ])('refuses %s as an area id, because it cannot be a file name', (_label, id) => {
      const map = sampleMap();
      map.continents[0].areas[0].id = id;
      const result = publishAudited(map, { publishedAt: DAY });
      expect(result.ok).toBe(false);
      expect(result.errors).toEqual([expect.stringContaining(`area "${id}" cannot be a file name`)]);
    });

    it.each([
      ['a leading hyphen', '-town'],
      ['more than 64 characters', 'a'.repeat(65)],
    ])('refuses %s as an area id: the strict reader already rejects it', (_label, id) => {
      const map = sampleMap();
      map.continents[0].areas[0].id = id;
      const result = publishAudited(map, { publishedAt: DAY });
      expect(result.ok).toBe(false);
      expect(result.errors.every((e) => e.startsWith('the audited file:'))).toBe(true);
    });

    it('accepts an area id of exactly 64 characters', () => {
      const map = sampleMap();
      map.continents[0].areas[0].id = 'a'.repeat(64);
      expect(publishAudited(map, { publishedAt: DAY }).ok).toBe(true);
    });

    it('refuses a merged room whose surviving room is in another area, naming the area', () => {
      const map = sampleMap();
      map.continents[0].areas[1].subzones[0].rooms.push(
        room('r7', 'Mill Road (merged)', { aliasOf: 'r1', sources: [{ kind: 'walked' }] }),
      );
      expect(validateMapFile(map).ok).toBe(true); // fine as one file
      const result = publishAudited(map, { publishedAt: DAY });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.every((e) => e.startsWith('area forest:'))).toBe(true);
      expect(result.manifest).toBeNull();
      expect(result.areas).toEqual([]);
    });
  });

  it('PUBLISH_SLUG accepts the ids the importers write', () => {
    for (const id of ['az-a100', 'az-unzoned-0', 'town', 'a1-b2-c3']) expect(PUBLISH_SLUG.test(id)).toBe(true);
  });
});
