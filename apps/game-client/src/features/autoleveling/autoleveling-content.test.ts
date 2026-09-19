// apps/game-client/src/features/autoleveling/autoleveling-content.test.ts

import type { AutoPilotArea, AutoPilotAreaSummary } from './autoleveling-content-types';
import { memoryKvStore } from './autoleveling-idb';
import {
  __setAreaStoreForTests,
  areaBySlug,
  areasByContinent,
  areasForLevel,
  areasForLevelRange,
  fullRoute,
  getAreaDetail,
  getAreaIndex,
  getAreaIndexCached,
  isLevelInRange,
} from './autoleveling-content';

const summary = (over: Partial<AutoPilotAreaSummary>): AutoPilotAreaSummary => ({
  slug: 'x',
  areaName: 'X',
  continent: 'Arkania',
  levelRange: [1, 5],
  isExcellentLevelingArea: false,
  stepCount: 1,
  targetCount: 0,
  ...over,
});

const INDEX: AutoPilotAreaSummary[] = [
  summary({ slug: 'new-mudschool', areaName: 'New Mudschool', continent: 'Limbo', levelRange: [1, 5] }),
  summary({ slug: 'centaur-village', areaName: 'Centaur Village', levelRange: [10, 20], isExcellentLevelingArea: true }),
  summary({ slug: 'gahboom-factory', areaName: 'Gahboom Factory', levelRange: [43, 51] }),
];

const CENTAUR_DETAIL: AutoPilotArea = {
  slug: 'centaur-village',
  areaName: 'Centaur Village',
  continent: 'Arkania',
  areaId: 'CentaurVillage',
  levelRange: [10, 20],
  startRoom: 'The Arkania Highroad',
  speedwalkToStart: 's',
  requiredActions: [],
  dirs: ['n', 'n', 'w'],
  notes: '',
  isExcellentLevelingArea: true,
  recommendedTargets: [{ lookName: 'A centaur ranger eyes you warily.', engageName: 'centaur ranger', level: 15 }],
};

function mockFetch(handler: (url: string) => unknown) {
  (global as any).fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => handler(url) }));
}

beforeEach(() => {
  __setAreaStoreForTests(memoryKvStore());
});

describe('area index cache', () => {
  it('fetches on a cold cache, then serves from cache', async () => {
    mockFetch(() => ({ areas: INDEX }));
    expect(await getAreaIndex()).toHaveLength(3);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(await getAreaIndex()).toHaveLength(3);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to cache when the network fails', async () => {
    mockFetch(() => ({ areas: INDEX }));
    await getAreaIndex();
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));
    expect(await getAreaIndex({ force: true })).toHaveLength(3);
  });

  it('drops malformed rows', async () => {
    mockFetch(() => ({ areas: [...INDEX, { slug: 42 }] }));
    expect(await getAreaIndex()).toHaveLength(3);
  });

  it('tolerates omitted default fields (C# DefaultValueHandling.Ignore)', async () => {
    // false bool + 0 int are dropped by the server serializer.
    mockFetch(() => ({
      areas: [{ slug: 'algoron-threadworks', areaName: 'Algoron Threadworks', continent: 'Shokono', levelRange: [43, 51], stepCount: 42 }],
    }));
    const [a] = await getAreaIndex();
    expect(a.isExcellentLevelingArea).toBe(false);
    expect(a.targetCount).toBe(0);
    expect(a.stepCount).toBe(42);
  });

  it('getAreaIndexCached never hits the network', async () => {
    (global as any).fetch = jest.fn();
    expect(await getAreaIndexCached()).toEqual([]);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});

describe('area detail cache', () => {
  it('fetches per slug and caches independently', async () => {
    mockFetch((url) => (url.endsWith('/centaur-village') ? CENTAUR_DETAIL : { error: 'nope' }));
    const d = await getAreaDetail('centaur-village');
    expect(d?.dirs).toEqual(['n', 'n', 'w']);
    expect(d?.recommendedTargets).toHaveLength(1);

    await getAreaDetail('centaur-village');
    expect((global as any).fetch).toHaveBeenCalledTimes(1); // second call cached
  });

  it('returns null for an unknown / malformed area', async () => {
    mockFetch(() => ({ error: 'no such area' }));
    expect(await getAreaDetail('does-not-exist')).toBeNull();
  });

  it('normalizes a detail object with omitted defaults', async () => {
    mockFetch(() => ({
      slug: 'new-mudschool',
      areaName: 'New Mudschool',
      continent: 'Limbo',
      areaId: 'NewMudschool',
      levelRange: [1, 5],
      startRoom: 'A Sloped Hall',
      speedwalkToStart: 'u',
      requiredActions: [],
      dirs: ['n', 'n'],
      notes: '',
      recommendedTargets: [{ lookName: 'a red fox', engageName: 'fox' }],
      // isExcellentLevelingArea omitted (false)
    }));
    const d = await getAreaDetail('new-mudschool');
    expect(d?.isExcellentLevelingArea).toBe(false);
    expect(d?.recommendedTargets[0].engageName).toBe('fox');
  });
});

describe('pure helpers (operate on the summary shape)', () => {
  it('areasForLevel widens the band by a small margin', () => {
    expect(areasForLevel(INDEX, 3).map((a) => a.slug)).toEqual(['new-mudschool']);
    expect(areasForLevel(INDEX, 9).map((a) => a.slug)).toContain('centaur-village');
    expect(areasForLevel(INDEX, 3).map((a) => a.slug)).not.toContain('gahboom-factory');
  });

  it('isLevelInRange uses the unwidened band', () => {
    const centaur = areaBySlug(INDEX, 'centaur-village')!;
    expect(isLevelInRange(centaur, 15)).toBe(true);
    expect(isLevelInRange(centaur, 9)).toBe(false);
  });

  it('areasForLevelRange overlaps generously on both ends', () => {
    // filter 12-16 → new-mudschool (1-5) is >4 below, gahboom (43-51) way above
    expect(areasForLevelRange(INDEX, 12, 16).map((a) => a.slug)).toEqual(['centaur-village']);
    // a filter touching the top of new-mudschool's band still catches it via the margin
    expect(areasForLevelRange(INDEX, 8, 10, 4).map((a) => a.slug)).toContain('new-mudschool');
    // reversed min/max is tolerated
    expect(areasForLevelRange(INDEX, 51, 43).map((a) => a.slug)).toEqual(['gahboom-factory']);
  });

  it('areasForLevelRange treats a null bound as open-ended', () => {
    // min only — "level 18 and up"
    expect(areasForLevelRange(INDEX, 18, null).map((a) => a.slug)).toEqual(['centaur-village', 'gahboom-factory']);
    // max only — "up to level 12"
    expect(areasForLevelRange(INDEX, null, 12).map((a) => a.slug)).toEqual(['new-mudschool', 'centaur-village']);
    // both null — every area with a meaningful range, order preserved
    expect(areasForLevelRange(INDEX, null, null)).toHaveLength(3);
  });

  it('areasForLevelRange excludes areas whose range is unset (span >= 40)', () => {
    const withUnset = [...INDEX, summary({ slug: 'sinkhole', areaName: 'Sinkhole', levelRange: [1, 51] })];
    expect(areasForLevelRange(withUnset, 10, 20).map((a) => a.slug)).not.toContain('sinkhole');
    expect(areasForLevelRange(withUnset, 10, 20).map((a) => a.slug)).toContain('centaur-village');
    expect(areasForLevelRange(withUnset, null, null).map((a) => a.slug)).not.toContain('sinkhole');
  });

  it('areasByContinent groups and preserves every area', () => {
    const groups = areasByContinent(INDEX);
    expect(groups.flatMap((g) => g.areas)).toHaveLength(3);
    expect(groups.map((g) => g.continent)).toContain('Limbo');
  });

  it('fullRoute stitches required actions + dirs, skipping speedwalkToStart for now', () => {
    expect(fullRoute({ ...CENTAUR_DETAIL, speedwalkToStart: 's;s', requiredActions: ['open gate'], dirs: ['n', 'e'] })).toBe(
      'open gate;n;e',
    );
  });
});
