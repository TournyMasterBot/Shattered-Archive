// apps/game-client/src/features/autoleveling/autoleveling-target-overrides.test.ts

import {
  MAX_TARGET_TEXT,
  applyTargetOverrides,
  diffAgainstDefault,
  isSafeTargetText,
  normalizeTargetOverrideData,
  targetOverrideKey,
} from './autoleveling-target-overrides';

const RANGER = { lookName: 'A centaur ranger eyes you warily.', engageName: 'ranger', level: 15 };
const SCOUT = { lookName: 'A lone centaur scout watches the road.', engageName: 'scout' };

describe('targetOverrideKey (E1)', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(targetOverrideKey('  A Centaur   RANGER\teyes you.  ')).toBe('a centaur ranger eyes you.');
  });

  it('treats a missing room line as an empty key', () => {
    expect(targetOverrideKey(undefined as unknown as string)).toBe('');
  });

  it('gives the same key for lines that differ only by case or spacing', () => {
    expect(targetOverrideKey('An enlarged squirrel scurries about here.')).toBe(
      targetOverrideKey('an  ENLARGED squirrel  scurries about here.'),
    );
  });
});

describe('isSafeTargetText (E3)', () => {
  it('accepts an ordinary room line and a keyword', () => {
    expect(isSafeTargetText('A centaur ranger eyes you warily.')).toBe(true);
    expect(isSafeTargetText('ranger')).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['command stacking', 'ranger;quit'],
    ['line feed', 'ranger\nquit'],
    ['carriage return', 'ranger\rquit'],
    ['tab', 'ranger\tquit'],
    ['NUL', 'ranger\u0000'],
    ['DEL', 'ranger\u007f'],
    ['C1 control', 'ranger\u0085'],
    ['too long', 'x'.repeat(MAX_TARGET_TEXT + 1)],
    ['not a string', 42],
    ['undefined', undefined],
  ])('refuses %s', (_label, value) => {
    expect(isSafeTargetText(value)).toBe(false);
  });

  it('accepts text exactly at the cap', () => {
    expect(isSafeTargetText('x'.repeat(MAX_TARGET_TEXT))).toBe(true);
  });
});

describe('normalizeTargetOverrideData (E5)', () => {
  it('normalizes the key and trims edited text', () => {
    expect(normalizeTargetOverrideData({ key: '  A Centaur  Ranger ', lookName: '  New line.  ', engageName: ' rng ' })).toEqual({
      key: 'a centaur ranger',
      lookName: 'New line.',
      engageName: 'rng',
    });
  });

  it('keeps hidden only when true', () => {
    expect(normalizeTargetOverrideData({ key: 'k', hidden: true })).toEqual({ key: 'k', hidden: true });
    expect(normalizeTargetOverrideData({ key: 'k', hidden: false })).toEqual({ key: 'k' });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['no key', { hidden: true }],
    ['an unsafe key', { key: 'a;b' }],
    ['an unknown field', { key: 'k', extra: 1 }],
    ['an unsafe edited room line', { key: 'k', lookName: 'a;b' }],
    ['an empty keyword', { key: 'k', engageName: '' }],
    ['a non-boolean hidden', { key: 'k', hidden: 'yes' }],
  ])('refuses %s', (_label, value) => {
    expect(normalizeTargetOverrideData(value)).toBeNull();
  });
});

describe('diffAgainstDefault (E15, E16, E6)', () => {
  it('stores nothing when the patch equals the server value', () => {
    expect(diffAgainstDefault(RANGER, null, { lookName: RANGER.lookName, engageName: RANGER.engageName })).toBeNull();
  });

  it('stores only the field that differs', () => {
    expect(diffAgainstDefault(RANGER, null, { engageName: 'rng' })).toEqual({
      key: targetOverrideKey(RANGER.lookName),
      engageName: 'rng',
    });
  });

  it('compares strictly: a different case is a real edit, not "the same"', () => {
    expect(diffAgainstDefault(RANGER, null, { engageName: 'Ranger' })).toEqual({
      key: targetOverrideKey(RANGER.lookName),
      engageName: 'Ranger',
    });
  });

  it('trims the edit before comparing, so padding alone is not an edit', () => {
    expect(diffAgainstDefault(RANGER, null, { engageName: '  ranger  ' })).toBeNull();
  });

  it('an edit back to the default removes that field and keeps the others', () => {
    const existing = { key: targetOverrideKey(RANGER.lookName), lookName: 'New line.', engageName: 'rng' };
    expect(diffAgainstDefault(RANGER, existing, { engageName: 'ranger' })).toEqual({
      key: targetOverrideKey(RANGER.lookName),
      lookName: 'New line.',
    });
  });

  it('keeps an existing edit when the patch touches another field', () => {
    const existing = { key: targetOverrideKey(RANGER.lookName), engageName: 'rng' };
    expect(diffAgainstDefault(RANGER, existing, { hidden: true })).toEqual({
      key: targetOverrideKey(RANGER.lookName),
      engageName: 'rng',
      hidden: true,
    });
  });

  it('restoring a hidden target with no other edit leaves nothing', () => {
    const existing = { key: targetOverrideKey(RANGER.lookName), hidden: true as const };
    expect(diffAgainstDefault(RANGER, existing, { hidden: false })).toBeNull();
  });

  it.each([
    ['an empty room line', { lookName: '' }],
    ['a stacked command', { engageName: 'ranger;quit' }],
    ['a line break', { lookName: 'line\nbreak' }],
  ])('returns "unsafe" for %s', (_label, patch) => {
    expect(diffAgainstDefault(RANGER, null, patch)).toBe('unsafe');
  });
});

describe('applyTargetOverrides (E1, E6, E13, E22)', () => {
  const rec = (data: unknown, id = 'o1', updatedAt = 1) => ({ id, areaSlug: 'centaur-village', data, updatedAt });

  it('returns the server rows untouched when there are no overrides', () => {
    const { rows, unmatched } = applyTargetOverrides([RANGER, SCOUT], []);
    expect(unmatched).toEqual([]);
    expect(rows.map((r) => [r.lookName, r.engageName, r.hidden, r.overridden])).toEqual([
      [RANGER.lookName, 'ranger', false, false],
      [SCOUT.lookName, 'scout', false, false],
    ]);
    expect(rows[0]).toMatchObject({ level: 15, defaultLookName: RANGER.lookName, defaultEngageName: 'ranger' });
  });

  it('applies an edit and a hidden flag, keeping the server default alongside', () => {
    const { rows } = applyTargetOverrides(
      [RANGER, SCOUT],
      [
        rec({ key: targetOverrideKey(RANGER.lookName), engageName: 'rng', lookName: 'A tall centaur ranger eyes you.' }),
        rec({ key: targetOverrideKey(SCOUT.lookName), hidden: true }, 'o2'),
      ],
    );
    expect(rows[0]).toMatchObject({
      lookName: 'A tall centaur ranger eyes you.',
      engageName: 'rng',
      overridden: true,
      hidden: false,
      defaultLookName: RANGER.lookName,
      defaultEngageName: 'ranger',
    });
    expect(rows[1]).toMatchObject({ lookName: SCOUT.lookName, engageName: 'scout', hidden: true, overridden: true });
  });

  it('matches the override to the server row by the normalized original room line', () => {
    const { rows } = applyTargetOverrides(
      [{ lookName: 'An   Enlarged Squirrel scurries about here.', engageName: 'squirrel' }],
      [rec({ key: 'an enlarged squirrel scurries about here.', engageName: 'sq' })],
    );
    expect(rows[0].engageName).toBe('sq');
  });

  it('keeps the first of two server rows with the same key, as the wizard seed does', () => {
    const { rows } = applyTargetOverrides(
      [
        { lookName: 'A bird perches here.', engageName: 'bird' },
        { lookName: 'a  BIRD perches here.', engageName: 'other' },
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].engageName).toBe('bird');
  });

  it('keeps an override for a target the server dropped as unmatched, and does not apply it', () => {
    const { rows, unmatched } = applyTargetOverrides(
      [SCOUT],
      [rec({ key: targetOverrideKey(RANGER.lookName), engageName: 'rng' }, 'gone')],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].overridden).toBe(false);
    expect(unmatched).toEqual([{ id: 'gone', key: targetOverrideKey(RANGER.lookName), engageName: 'rng' }]);
  });

  it('re-attaches the override when the key reappears in the served list', () => {
    const overrides = [rec({ key: targetOverrideKey(RANGER.lookName), engageName: 'rng' }, 'back')];
    expect(applyTargetOverrides([SCOUT], overrides).unmatched).toHaveLength(1);
    const again = applyTargetOverrides([SCOUT, RANGER], overrides);
    expect(again.unmatched).toEqual([]);
    expect(again.rows[1].engageName).toBe('rng');
  });

  it('a later record with no updatedAt counts as oldest and does not displace a dated one (E13)', () => {
    const key = targetOverrideKey(RANGER.lookName);
    const { rows } = applyTargetOverrides(
      [RANGER],
      [rec({ key, engageName: 'dated' }, 'a', 5), { id: 'b', areaSlug: 'x', data: { key, engageName: 'undated' } } as never],
    );
    expect(rows[0].engageName).toBe('dated');
  });

  it('with two records for one key the newest updatedAt wins (E13)', () => {
    const key = targetOverrideKey(RANGER.lookName);
    const { rows } = applyTargetOverrides(
      [RANGER],
      [rec({ key, engageName: 'old' }, 'a', 5), rec({ key, engageName: 'new' }, 'b', 9), rec({ key, engageName: 'older' }, 'c', 1)],
    );
    expect(rows[0].engageName).toBe('new');
  });

  it('ignores a malformed override record and still returns every server row (E5)', () => {
    const { rows, unmatched } = applyTargetOverrides([RANGER], [rec({ key: 'a;b' }), rec('junk', 'x'), rec(null, 'y'), null as never]);
    expect(rows).toHaveLength(1);
    expect(rows[0].overridden).toBe(false);
    expect(unmatched).toEqual([]);
  });

  it('an override record with no updatedAt still applies (treated as oldest)', () => {
    const { rows } = applyTargetOverrides(
      [RANGER],
      [{ id: 'n', areaSlug: 'centaur-village', data: { key: targetOverrideKey(RANGER.lookName), engageName: 'rng' } } as never],
    );
    expect(rows[0].engageName).toBe('rng');
  });

  it('skips a server row with an empty room line', () => {
    expect(applyTargetOverrides([{ lookName: '   ', engageName: 'x' }, SCOUT], []).rows).toHaveLength(1);
  });
});
