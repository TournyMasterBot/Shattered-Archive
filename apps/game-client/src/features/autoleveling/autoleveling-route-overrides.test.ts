// apps/game-client/src/features/autoleveling/autoleveling-route-overrides.test.ts

import {
  MAX_ROUTE_STEPS,
  applyRouteOverride,
  diffRouteAgainstDefault,
  normalizeRouteOverrideData,
  parseRouteText,
  routeToText,
} from './autoleveling-route-overrides';
import type { AutoPilotArea } from './autoleveling-content-types';

describe('parseRouteText / routeToText', () => {
  it('splits on ; and line breaks, trims, and drops empty pieces', () => {
    expect(parseRouteText(' e ;; se;\n\nopen west\r\nw; ')).toEqual(['e', 'se', 'open west', 'w']);
  });

  it('gives no steps for blank text', () => {
    expect(parseRouteText('  \n ; ')).toEqual([]);
    expect(parseRouteText(undefined as unknown as string)).toEqual([]);
  });

  it('round-trips a route through its editor text', () => {
    expect(routeToText(['e', 'se', 'w'])).toBe('e;se;w');
    expect(parseRouteText(routeToText(['e', 'se', 'w']))).toEqual(['e', 'se', 'w']);
  });
});

describe('normalizeRouteOverrideData', () => {
  it('accepts and trims a list of steps', () => {
    expect(normalizeRouteOverrideData({ dirs: [' e', 'se '] })).toEqual({ dirs: ['e', 'se'] });
  });

  it('accepts exactly the maximum number of steps and refuses one more', () => {
    expect(normalizeRouteOverrideData({ dirs: Array(MAX_ROUTE_STEPS).fill('e') })).not.toBeNull();
    expect(normalizeRouteOverrideData({ dirs: Array(MAX_ROUTE_STEPS + 1).fill('e') })).toBeNull();
  });

  it.each([
    ['null', null],
    ['an array', ['e']],
    ['a missing dirs', {}],
    ['an empty dirs', { dirs: [] }],
    ['dirs that is not an array', { dirs: 'e;se' }],
    ['a non-string step', { dirs: ['e', 3] }],
    ['a blank step', { dirs: ['e', '   '] }],
    ['a step with ;', { dirs: ['e;quit'] }],
    ['a step with a line break', { dirs: ['e\nquit'] }],
    ['a step with a control character', { dirs: ['e\u0007'] }],
    ['a step over 200 characters', { dirs: ['x'.repeat(201)] }],
    ['an unknown field', { dirs: ['e'], extra: true }],
  ])('refuses %s', (_name, raw) => {
    expect(normalizeRouteOverrideData(raw)).toBeNull();
  });
});

describe('diffRouteAgainstDefault', () => {
  const served = ['e', 'se', 'w'];

  it('returns the whole wanted route when it differs', () => {
    expect(diffRouteAgainstDefault(served, ['e', 'se', 'w', 'w'])).toEqual({ dirs: ['e', 'se', 'w', 'w'] });
  });

  it('returns null when the wanted route equals the served one (after trimming)', () => {
    expect(diffRouteAgainstDefault(served, [' e', 'se', 'w '])).toBeNull();
  });

  it('treats the same steps in another order as a change', () => {
    expect(diffRouteAgainstDefault(served, ['se', 'e', 'w'])).toEqual({ dirs: ['se', 'e', 'w'] });
  });

  it('treats a missing (null / undefined) step as a blank, unsafe step', () => {
    expect(diffRouteAgainstDefault(served, ['e', null as unknown as string])).toBe('unsafe');
    expect(diffRouteAgainstDefault(served, [undefined as unknown as string])).toBe('unsafe');
  });

  it('names why a route is refused', () => {
    expect(diffRouteAgainstDefault(served, [])).toBe('empty');
    expect(diffRouteAgainstDefault(served, ['e', ''])).toBe('unsafe');
    expect(diffRouteAgainstDefault(served, ['e;n'])).toBe('unsafe');
    expect(diffRouteAgainstDefault(served, Array(MAX_ROUTE_STEPS + 1).fill('e'))).toBe('too-long');
  });
});

describe('applyRouteOverride', () => {
  const area = { slug: 'a', dirs: ['e', 'se'], requiredActions: ['c pass'] } as unknown as AutoPilotArea;

  it('returns the served area untouched when there is no override', () => {
    expect(applyRouteOverride(area, null)).toEqual({ area, overridden: false });
  });

  it('replaces only dirs, leaves required actions, and does not change the served object', () => {
    const res = applyRouteOverride(area, { dirs: ['n', 'w'] });
    expect(res.overridden).toBe(true);
    expect(res.area.dirs).toEqual(['n', 'w']);
    expect(res.area.requiredActions).toEqual(['c pass']);
    expect(area.dirs).toEqual(['e', 'se']);
  });
});
