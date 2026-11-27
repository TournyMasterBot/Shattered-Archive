import { buildIndex, sliceMap } from './hierarchy.js';
import { renderSvg } from './render.js';
import { sampleMap } from './testing/fixtures.js';
import { validateMapFile } from './validate.js';
import { applyFog } from './fog.js';

const ids = (map: ReturnType<typeof sampleMap>): string[] => [...buildIndex(map).rooms.keys()];

describe('applyFog', () => {
  it('keeps only the visible rooms, and drops the subzones and links of the rest', () => {
    const fogged = applyFog(sampleMap(), new Set(['r1', 'r2']));
    expect(ids(fogged)).toEqual(['r1', 'r2']);
    expect(fogged.links.map((l) => l.id).sort()).toEqual(['l-r1-e', 'l-r1-n', 'l-r1-s', 'l-r2-s', 'l-r2-w']);
    expect(fogged.continents[0].areas.map((a) => [a.id, a.subzones.map((s) => s.id)])).toEqual([['town', ['town-main']], ['forest', []]]);
  });

  it('turns an exit towards an unseen room into an unknown stub that names nothing', () => {
    const fogged = applyFog(sampleMap(), new Set(['r1', 'r2']));
    const toUnseen = fogged.links.find((l) => l.id === 'l-r1-s');
    expect(toUnseen).toMatchObject({ to: null, state: 'unknown-target', confidence: 0, offPage: false, reverse: false });
    const toSeen = fogged.links.find((l) => l.id === 'l-r1-e');
    expect(toSeen).toMatchObject({ to: 'r2', state: 'confirmed', confidence: 0.95, reverse: true });
    expect(JSON.stringify(fogged)).not.toMatch(/Old Well|Gate|Cellar/);
    expect(JSON.stringify(fogged)).not.toContain('r3');
  });

  it('leaves an exit towards a visible room of another area as an off-page exit', () => {
    const fogged = applyFog(sampleMap(), new Set(['r4', 'r6']));
    expect(fogged.links.find((l) => l.id === 'l-r4-e')).toMatchObject({ to: 'r6', offPage: true });
  });

  it('turns an off-page exit to an unseen room into a stub too, and an exit that was already unknown stays one', () => {
    const fogged = applyFog(sampleMap(), new Set(['r4', 'r1']));
    expect(fogged.links.find((l) => l.id === 'l-r4-e')).toMatchObject({ to: null, offPage: false });
    expect(fogged.links.find((l) => l.id === 'l-r1-n')).toMatchObject({ to: null, state: 'unknown-target' });
  });

  it('forgets the places a conflict pointed at, since they may be unseen', () => {
    const map = sampleMap();
    map.links[0] = { ...map.links[0], state: 'conflict', conflictTo: ['r5', 'r6'] };
    const fogged = applyFog(map, new Set(['r1', 'r2']));
    expect(fogged.links.find((l) => l.id === 'l-r1-e')).not.toHaveProperty('conflictTo');
  });

  it('shows nothing when nothing is visible, and everything when everything is', () => {
    const none = applyFog(sampleMap(), new Set());
    expect(ids(none)).toEqual([]);
    expect(none.links).toEqual([]);
    const all = applyFog(sampleMap(), new Set(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']));
    expect(all).toEqual(sampleMap());
  });

  it('does not change the map it was given, and the copy passes the strict reader and draws', () => {
    const map = sampleMap();
    const before = JSON.stringify(map);
    const fogged = applyFog(map, new Set(['r1', 'r3']));
    expect(JSON.stringify(map)).toBe(before);
    expect(validateMapFile(fogged).ok).toBe(true);
    const slice = sliceMap(fogged, 'area', 'town');
    expect(slice).not.toBeNull();
    const svg = renderSvg(slice!, { layout: 'grid', z: 0, labels: true });
    expect(svg).toContain('Market Square');
    expect(svg).not.toContain('Mill Road');
    expect(svg).not.toContain('Gate');
  });

  it('drops a room that was merged away unless it is visible', () => {
    const map = sampleMap();
    map.continents[0].areas[0].subzones[0].rooms.push({ id: 'old', title: 'Merged Away', exits: {}, sources: [], aliasOf: 'r1' });
    expect(ids(applyFog(map, new Set(['r1'])))).toEqual(['r1']);
  });
});
