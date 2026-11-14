import { FLOOR_KINDS, SPHERES } from '../contracts';
import { FLOOR_REASONS, isNeverAuto, NEVER_AUTO_KINDS } from './floor';
import {
  DEFAULT_RULE,
  DEFAULT_SETTINGS,
  normalizeSettings,
  ruleFor,
  ruleKey,
  settingsEqual,
  toStored,
} from './settings';

describe('defaults', () => {
  it('has every rule off and a 60 second stale limit', () => {
    expect(DEFAULT_SETTINGS).toEqual({ schemaVersion: 1, staleAfterSeconds: 60, rules: {} });
    expect(ruleFor(DEFAULT_SETTINGS as never, 'world', 'move')).toEqual({ enabled: false, threshold: 0.9 });
  });
});

describe('floor.ts', () => {
  it('never-auto kinds are the floor plus unknown and fight-start-unknown', () => {
    expect([...NEVER_AUTO_KINDS].sort()).toEqual([...FLOOR_KINDS, 'unknown', 'fight-start-unknown'].sort());
    expect(isNeverAuto('pk')).toBe(true);
    expect(isNeverAuto('move')).toBe(false);
  });

  it('gives a reason for every floor kind', () => {
    for (const kind of FLOOR_KINDS) expect(FLOOR_REASONS[kind].length).toBeGreaterThan(10);
  });
});

describe('normalizeSettings (A1, S4)', () => {
  it('turns anything unreadable into the defaults and never throws', () => {
    for (const bad of [undefined, null, 5, 'x', [], [1, 2], true, () => 1]) {
      expect(normalizeSettings(bad)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('keeps a valid blob', () => {
    const blob = { schemaVersion: 1, staleAfterSeconds: 120, rules: { 'world:move': { enabled: true, threshold: 0.85 } } };
    expect(normalizeSettings(blob)).toEqual(blob);
  });

  it('drops a rule for every floor kind, and for unknown and fight-start-unknown, however it is written (A1)', () => {
    const rules: Record<string, unknown> = {};
    for (const sphere of SPHERES) {
      for (const kind of NEVER_AUTO_KINDS) rules[`${sphere}:${kind}`] = { enabled: true, threshold: 0.5 };
    }
    rules['world:move'] = { enabled: true, threshold: 0.9 };
    expect(normalizeSettings({ rules }).rules).toEqual({ 'world:move': { enabled: true, threshold: 0.9 } });
  });

  it('drops a rule for an unknown sphere or kind, and a malformed key', () => {
    const rules = {
      'nowhere:move': { enabled: true, threshold: 0.9 },
      'world:teleport': { enabled: true, threshold: 0.9 },
      move: { enabled: true, threshold: 0.9 },
      'world:move:extra': { enabled: true, threshold: 0.9 },
    };
    expect(normalizeSettings({ rules }).rules).toEqual({});
  });

  it('drops a rule whose value is unreadable: a string threshold, NaN, out of range, no enabled flag, not an object', () => {
    const rules = {
      'world:move': { enabled: true, threshold: '0.9' },
      'world:info': { enabled: true, threshold: NaN },
      'world:loot': { enabled: true, threshold: 0.4 },
      'world:interact': { enabled: true, threshold: 1 },
      'world:ability': { threshold: 0.9 },
      'fighting:ability': { enabled: 'yes', threshold: 0.9 },
      'things:loot': 'on',
      'things:info': null,
    };
    expect(normalizeSettings({ rules }).rules).toEqual({});
  });

  it('accepts the threshold range ends and fills a missing threshold with the default', () => {
    const rules = normalizeSettings({
      rules: {
        'world:move': { enabled: true, threshold: 0.5 },
        'world:info': { enabled: true, threshold: 0.99 },
        'world:loot': { enabled: false },
      },
    }).rules;
    expect(rules['world:move'].threshold).toBe(0.5);
    expect(rules['world:info'].threshold).toBe(0.99);
    expect(rules['world:loot']).toEqual({ enabled: false, threshold: 0.9 });
  });

  it('falls back to the default stale limit for a bad value, and accepts the range ends', () => {
    for (const bad of ['60', 4.5, 4, 3601, NaN, -1, null]) {
      expect(normalizeSettings({ staleAfterSeconds: bad }).staleAfterSeconds).toBe(60);
    }
    expect(normalizeSettings({ staleAfterSeconds: 5 }).staleAfterSeconds).toBe(5);
    expect(normalizeSettings({ staleAfterSeconds: 3600 }).staleAfterSeconds).toBe(3600);
  });

  it('ignores unknown top-level keys and a rules value that is not an object', () => {
    expect(normalizeSettings({ extra: 1, rules: [1] })).toEqual(DEFAULT_SETTINGS);
  });

  it('puts the rules in a canonical order, so two blobs that differ only in order normalise identically', () => {
    const a = { rules: { 'world:move': { enabled: true, threshold: 0.9 }, 'things:loot': { enabled: true, threshold: 0.8 } } };
    const b = { rules: { 'things:loot': { enabled: true, threshold: 0.8 }, 'world:move': { enabled: true, threshold: 0.9 } } };
    expect(Object.keys(normalizeSettings(a).rules)).toEqual(Object.keys(normalizeSettings(b).rules));
    expect(JSON.stringify(normalizeSettings(a))).toBe(JSON.stringify(normalizeSettings(b)));
  });

  it('does not read inherited properties as rules', () => {
    const rules = Object.create({ 'world:move': { enabled: true, threshold: 0.9 } });
    expect(normalizeSettings({ rules }).rules).toEqual({});
  });
});

describe('ruleFor / ruleKey', () => {
  it('builds the sphere:kind key and returns a copy of the default for a missing bucket', () => {
    expect(ruleKey('world', 'move')).toBe('world:move');
    const settings = normalizeSettings({ rules: { 'world:move': { enabled: true, threshold: 0.8 } } });
    expect(ruleFor(settings, 'world', 'move')).toEqual({ enabled: true, threshold: 0.8 });
    const missing = ruleFor(settings, 'things', 'loot');
    expect(missing).toEqual(DEFAULT_RULE);
    missing.enabled = true;
    expect(DEFAULT_RULE.enabled).toBe(false);
  });
});

describe('settingsEqual: strict and structural (S2)', () => {
  it('does not coerce types: 0.9 is not "0.9", 1 is not true, null is not missing', () => {
    expect(settingsEqual(0.9, '0.9')).toBe(false);
    expect(settingsEqual(1, true)).toBe(false);
    expect(settingsEqual({ a: null }, {})).toBe(false);
    expect(settingsEqual({ a: undefined }, {})).toBe(false);
    expect(settingsEqual(null, undefined)).toBe(false);
  });

  it('treats objects as equal regardless of key order, including nested tables', () => {
    expect(settingsEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(settingsEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('treats arrays as equal only in the same order and length', () => {
    expect(settingsEqual([1, 2], [1, 2])).toBe(true);
    expect(settingsEqual([1, 2], [2, 1])).toBe(false);
    expect(settingsEqual([1], [1, 2])).toBe(false);
    expect(settingsEqual([], {})).toBe(false);
    expect(settingsEqual({}, [])).toBe(false);
  });

  it('treats NaN as equal to NaN, and compares numbers exactly', () => {
    expect(settingsEqual(NaN, NaN)).toBe(true);
    expect(settingsEqual(0.9, 0.9)).toBe(true);
    expect(settingsEqual(0.9, 0.90001)).toBe(false);
  });

  it('compares reordered rule maps as equal (the rules are a map, not a list)', () => {
    const a = normalizeSettings({ rules: { 'world:move': { enabled: true, threshold: 0.9 }, 'things:loot': { enabled: true, threshold: 0.8 } } });
    const b = normalizeSettings({ rules: { 'things:loot': { enabled: true, threshold: 0.8 }, 'world:move': { enabled: true, threshold: 0.9 } } });
    expect(settingsEqual(a, b)).toBe(true);
  });
});

describe('toStored: only differences from the defaults (S1)', () => {
  it('stores nothing when nothing differs', () => {
    expect(toStored(DEFAULT_SETTINGS)).toBeNull();
    expect(toStored(undefined)).toBeNull();
    expect(toStored({ staleAfterSeconds: 60, rules: {} })).toBeNull();
  });

  it('stores nothing for a rule that equals the default rule (off, 0.9)', () => {
    expect(toStored({ rules: { 'world:move': { enabled: false, threshold: 0.9 } } })).toBeNull();
    expect(toStored({ rules: { 'world:move': { enabled: false } } })).toBeNull();
  });

  it('stores an enabled rule, a disabled rule with a changed threshold, and a changed stale limit', () => {
    expect(
      toStored({
        staleAfterSeconds: 90,
        rules: {
          'world:move': { enabled: true, threshold: 0.9 },
          'things:loot': { enabled: false, threshold: 0.7 },
          'world:info': { enabled: false, threshold: 0.9 },
        },
      }),
    ).toEqual({
      schemaVersion: 1,
      staleAfterSeconds: 90,
      rules: { 'world:move': { enabled: true, threshold: 0.9 }, 'things:loot': { enabled: false, threshold: 0.7 } },
    });
  });

  it('leaves the stale limit out when it is the default, so a future default reaches this user', () => {
    expect(toStored({ rules: { 'world:move': { enabled: true, threshold: 0.9 } } })).toEqual({
      schemaVersion: 1,
      rules: { 'world:move': { enabled: true, threshold: 0.9 } },
    });
  });

  it('normalises on the way (S4): a blob that tries to enable a floor kind stores nothing', () => {
    expect(toStored({ rules: { 'world:pk': { enabled: true, threshold: 0.5 }, 'fighting:speak': { enabled: true, threshold: 0.5 } } })).toBeNull();
  });

  it('is stable: storing the normalised result again gives the same result', () => {
    const stored = toStored({ staleAfterSeconds: 90, rules: { 'world:move': { enabled: true, threshold: 0.8 } } });
    expect(toStored(stored)).toEqual(stored);
  });
});
