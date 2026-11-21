import { COMBAT_STATE_TEXT, describeRowOptions, enemyGateText } from './autoleveling-row-text';

describe('describeRowOptions', () => {
  it('is empty for a row with none of the options', () => {
    expect(describeRowOptions({})).toEqual([]);
  });

  it('words each option, in a fixed order', () => {
    expect(
      describeRowOptions({ retryUntilSet: false, enemyGate: { op: 'above', band: 30 }, combatState: 'out' }),
    ).toEqual([
      'only out of combat',
      'only when the enemy is above "has some big nasty wounds and scratches (about 30%)"',
      'no retry',
    ]);
  });

  it('names both combat states', () => {
    expect(COMBAT_STATE_TEXT).toEqual({ in: 'only in combat', out: 'only out of combat' });
    expect(describeRowOptions({ combatState: 'in' })).toEqual(['only in combat']);
  });

  it('says "about" for every band of the enemy gate', () => {
    for (const band of [0, 15, 30, 50, 75, 90, 100] as const) expect(enemyGateText({ op: 'below', band })).toMatch(new RegExp(`\\(about ${band}%\\)"$`));
  });
});
