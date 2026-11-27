import type { Sphere } from '@shatteredarchive/copilot-core';
import { makeLesson, makeSituation } from '../testing/situations';
import { routeSituation, startingSphere, type Lookup, type RouterDeps } from './router';
import { BUILT_IN_SPHERES } from './spheres';

/** A lookup that finds facts only in the listed spheres, and records which spheres were asked. */
function lookupIn(...found: Sphere[]): { lookup: Lookup; asked: Sphere[] } {
  const asked: Sphere[] = [];
  return {
    asked,
    lookup: async (sphere) => {
      asked.push(sphere);
      return found.includes(sphere) ? [`fact from ${sphere}`] : [];
    },
  };
}

const deps = (lookup: Lookup, lessons = [] as ReturnType<typeof makeLesson>[]): RouterDeps => ({ spheres: BUILT_IN_SPHERES, lookup, lessons: () => lessons });

describe('startingSphere', () => {
  it('maps each mode to its sphere', () => {
    expect([startingSphere('battle'), startingSphere('exploration'), startingSphere('questing'), startingSphere('leveling')]).toEqual(['fighting', 'world', 'interaction', 'fighting']);
  });
});

describe('routeSituation', () => {
  it('uses the mode sphere when it finds something', async () => {
    const { lookup, asked } = lookupIn('world');
    expect(await routeSituation(makeSituation(), deps(lookup))).toEqual({ sphere: 'world', facts: ['fact from world'], lessons: [], tried: ['world'] });
    expect(asked).toEqual(['world']);
  });

  it('follows the neighbour hint when the first sphere finds nothing, and stops at the first neighbour that finds something', async () => {
    const { lookup, asked } = lookupIn('interaction', 'fighting');
    const route = await routeSituation(makeSituation(), deps(lookup));
    expect(route).toMatchObject({ sphere: 'fighting', facts: ['fact from fighting'], tried: ['world', 'fighting'] });
    expect(asked).toEqual(['world', 'fighting']);
  });

  it('stays in the first sphere with no facts when nothing is found anywhere', async () => {
    const { lookup, asked } = lookupIn();
    expect(await routeSituation(makeSituation(), deps(lookup))).toEqual({ sphere: 'world', facts: [], lessons: [], tried: ['world', 'fighting', 'interaction'] });
    expect(asked).toEqual(['world', 'fighting', 'interaction']);
  });

  it('puts accepted lessons for this situation first, and they name the sphere and stop the search', async () => {
    const { lookup, asked } = lookupIn();
    const lessons = [
      makeLesson({ id: 'a', sphere: 'things' }),
      makeLesson({ id: 'proposed', status: 'proposed' }),
      makeLesson({ id: 'other', situationKey: 'exploration:elsewhere' }),
      makeLesson({ id: 'rejected', status: 'rejected' }),
    ];
    const route = await routeSituation(makeSituation(), deps(lookup, lessons));
    expect(route.sphere).toBe('things');
    expect(route.lessons.map((l) => l.id)).toEqual(['a']); // a proposed lesson is never used (E6)
    expect(asked).toEqual(['things']);
  });

  it('a start sphere overrides both the mode and the lessons', async () => {
    const { lookup } = lookupIn('interaction');
    const route = await routeSituation(makeSituation(), deps(lookup, [makeLesson({ sphere: 'things' })]), { start: 'interaction' });
    expect(route.sphere).toBe('interaction');
    expect(route.tried).toEqual(['interaction']);
  });

  it('treats a lookup that throws as no facts', async () => {
    const throwing: Lookup = async () => {
      throw new Error('archive down');
    };
    expect(await routeSituation(makeSituation(), deps(throwing))).toMatchObject({ sphere: 'world', facts: [] });
  });
});

describe('routeSituation and the hint tiers', () => {
  it('adds the room hints to the route whatever sphere the situation belongs to, and asks for them every time', async () => {
    const { lookup } = lookupIn('world');
    const hints = jest.fn(async () => ['Hint (instant): look fountain']);
    const route = await routeSituation(makeSituation(), { ...deps(lookup), hints });
    expect(route).toMatchObject({ sphere: 'world', facts: ['fact from world'], hints: ['Hint (instant): look fountain'] });
    expect(hints).toHaveBeenCalledTimes(1);
  });

  it('leaves the route as it was when there are no hints, no hint function, or the hint function fails', async () => {
    const { lookup } = lookupIn('world');
    const plain = { sphere: 'world', facts: ['fact from world'], lessons: [], tried: ['world'] };
    expect(await routeSituation(makeSituation(), { ...deps(lookup), hints: async () => [] })).toEqual(plain);
    expect(await routeSituation(makeSituation(), deps(lookup))).toEqual(plain);
    expect(await routeSituation(makeSituation(), { ...deps(lookup), hints: async () => Promise.reject(new Error('down')) })).toEqual(plain);
  });

  it('passes the cancel signal to the hint function', async () => {
    const { lookup } = lookupIn('world');
    const hints = jest.fn(async () => []);
    const controller = new AbortController();
    await routeSituation(makeSituation(), { ...deps(lookup), hints }, { signal: controller.signal });
    expect(hints).toHaveBeenCalledWith(expect.anything(), controller.signal);
  });
});
