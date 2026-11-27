import {
  ACTION_KINDS,
  COPILOT_BUNDLE_MARKER,
  DECISION_OUTCOMES,
  FLOOR_KINDS,
  MODES,
  SPHERES,
  TICKET_REASONS,
  isActionKind,
  isFloorKind,
  isMode,
  isSphere,
} from './contracts';

describe('contracts', () => {
  it('keeps the bundle marker exactly, because the production guard greps for it', () => {
    expect(COPILOT_BUNDLE_MARKER).toBe('sa-copilot-local-v1');
  });

  it('lists the four spheres of the scope in order', () => {
    expect([...SPHERES]).toEqual(['world', 'fighting', 'interaction', 'things']);
  });

  it('lists the four modes of the scope in order', () => {
    expect([...MODES]).toEqual(['battle', 'exploration', 'questing', 'leveling']);
  });

  it('defines the hard floor as spend/lose, speak, irreversible and player-kill', () => {
    expect([...FLOOR_KINDS]).toEqual(['spend-or-lose', 'speak', 'irreversible', 'pk']);
  });

  it('contains every floor kind in the action kinds (A1)', () => {
    for (const kind of FLOOR_KINDS) {
      expect(ACTION_KINDS).toContain(kind);
    }
  });

  it('has an unknown kind and the three fight-start/continue kinds the owner distinguishes', () => {
    expect(ACTION_KINDS).toEqual(
      expect.arrayContaining(['unknown', 'fight-continue', 'fight-start-known', 'fight-start-unknown']),
    );
  });

  it('has no duplicate action kinds', () => {
    expect(new Set(ACTION_KINDS).size).toBe(ACTION_KINDS.length);
  });

  it('covers every decision outcome the command gate records', () => {
    expect([...DECISION_OUTCOMES]).toEqual(['approved', 'corrected', 'rejected', 'auto', 'refused']);
  });

  it('lists the ticket reasons the ledger accepts', () => {
    expect([...TICKET_REASONS]).toEqual([
      'low-confidence',
      'correction-not-understood',
      'danger',
      'wrong-sphere',
      'persona-feedback',
      'unknown-situation',
    ]);
  });

  describe('guards', () => {
    it('accept members and reject everything else, including non-strings', () => {
      expect(isSphere('world')).toBe(true);
      expect(isSphere('World')).toBe(false);
      expect(isSphere(undefined)).toBe(false);
      expect(isMode('battle')).toBe(true);
      expect(isMode('autopilot')).toBe(false);
      expect(isMode(3)).toBe(false);
      expect(isActionKind('move')).toBe(true);
      expect(isActionKind('')).toBe(false);
      expect(isActionKind(null)).toBe(false);
      expect(isFloorKind('pk')).toBe(true);
      expect(isFloorKind('move')).toBe(false);
      expect(isFloorKind({})).toBe(false);
    });
  });
});
