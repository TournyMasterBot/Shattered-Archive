// apps/game-client/src/features/movement/classifyMovement.test.ts

import { classifyMovement, normalizeExit, exitsToSet, MOVE_DIRS, DIR_TO_COMMAND } from './classifyMovement';

describe('classifyMovement', () => {
  it('classifies every corpus-verified real direction token as a move', () => {
    for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd']) {
      expect(classifyMovement(dir)).toEqual({ isMove: true, dir });
    }
  });

  it('is case-insensitive and only looks at the first token', () => {
    expect(classifyMovement('N')).toEqual({ isMove: true, dir: 'n' });
    expect(classifyMovement('  se  ')).toEqual({ isMove: true, dir: 'se' });
    expect(classifyMovement('n rest of a line')).toEqual({ isMove: true, dir: 'n' });
  });

  it('does not classify the dropped full-word "up"/"down" forms as movement', () => {
    // The 30-day+ historical corpus never sent these as a bare command — dropped from
    // MOVE_DIRS rather than kept as dead-but-harmless entries (see plan Constraints).
    expect(classifyMovement('up')).toEqual({ isMove: false });
    expect(classifyMovement('down')).toEqual({ isMove: false });
  });

  it('rejects non-movement commands and blank input', () => {
    expect(classifyMovement('kill rat')).toEqual({ isMove: false });
    expect(classifyMovement('')).toEqual({ isMove: false });
    expect(classifyMovement('   ')).toEqual({ isMove: false });
  });

  it('MOVE_DIRS is exactly the 10 corpus-verified tokens', () => {
    expect([...MOVE_DIRS].sort()).toEqual(['d', 'e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'u', 'w'].sort());
  });
});

describe('normalizeExit', () => {
  it('accepts short forms case-insensitively', () => {
    expect(normalizeExit('n')).toBe('N');
    expect(normalizeExit('SE')).toBe('SE');
    expect(normalizeExit('u')).toBe('U');
  });

  it('accepts long forms', () => {
    expect(normalizeExit('north')).toBe('N');
    expect(normalizeExit('SOUTHWEST')).toBe('SW');
    expect(normalizeExit('Up')).toBe('U');
    expect(normalizeExit('down')).toBe('D');
  });

  it('returns null for anything unrecognized', () => {
    expect(normalizeExit('sideways')).toBeNull();
    expect(normalizeExit('')).toBeNull();
  });

  it('round-trips through DIR_TO_COMMAND back to the wire form', () => {
    for (const [dir, cmd] of Object.entries(DIR_TO_COMMAND)) {
      expect(normalizeExit(cmd)).toBe(dir);
    }
  });
});

describe('exitsToSet', () => {
  it('normalizes a GMCP exits array, dropping unrecognized entries', () => {
    const set = exitsToSet(['n', 'South', 'nowhere', 'U']);
    expect(set).toEqual(new Set(['N', 'S', 'U']));
  });

  it('returns an empty set for non-array input', () => {
    expect(exitsToSet(undefined)).toEqual(new Set());
    expect(exitsToSet(null)).toEqual(new Set());
  });
});
