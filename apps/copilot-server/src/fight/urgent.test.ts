import { FightMonitor, ROUND_MS, type FeedEvent } from '@shatteredarchive/copilot-core';
import { urgentFor } from './urgent';

const T0 = 1_000_000;
const vitals = (at: number, hp: number): FeedEvent => ({ type: 'vitals', at, inFight: true, vitals: { hp, maxHp: 100, mana: 1, maxMana: 1, move: 1, maxMove: 1 } });
const lines = (at: number, ...text: string[]): FeedEvent => ({ type: 'lines', at, lines: text });

function monitor(...events: FeedEvent[]): FightMonitor {
  const m = new FightMonitor();
  for (const e of events) m.feed(e);
  return m;
}

describe('urgentFor', () => {
  it('has nothing to say when there is no fight or the fight is going well', () => {
    expect(urgentFor(new FightMonitor().snapshot(T0))).toBeUndefined();
    const fine = monitor(vitals(T0, 100), lines(T0, 'You hit the rat.', 'The rat is in excellent condition.'), lines(T0 + ROUND_MS, 'You hit the rat.', 'The rat looks pretty hurt.'));
    expect(urgentFor(fine.snapshot(T0 + ROUND_MS))).toBeUndefined();
  });

  it('says to flee when the hit points are low, and names them', () => {
    const low = monitor(vitals(T0, 100), lines(T0, 'The ogre mauls you!'), vitals(T0 + ROUND_MS, 20), lines(T0 + ROUND_MS, 'The ogre hits you.'));
    expect(urgentFor(low.snapshot(T0 + ROUND_MS))).toEqual({ command: 'flee', rationale: expect.stringContaining('hit points are at 20%') });
  });

  it('says to flee when the character will die well before the opponent, with the estimate in rounds', () => {
    const losing = monitor(
      vitals(T0, 100),
      lines(T0, 'You hit the ogre.', 'The ogre is in excellent condition.', 'The ogre mauls you!'),
      vitals(T0 + ROUND_MS, 70),
      lines(T0 + ROUND_MS, 'You hit the ogre.', 'The ogre has a few scratches.', 'The ogre mauls you!'),
    );
    const urgent = urgentFor(losing.snapshot(T0 + ROUND_MS));
    expect(urgent?.command).toBe('flee');
    expect(urgent?.rationale).toMatch(/about 5 rounds from death while the opponent needs about 34/);
    expect(urgent?.rationale).toContain("not the model's");
  });

  it('says "some" rounds when the opponent cannot be estimated', () => {
    const blind = monitor(vitals(T0, 100), lines(T0, 'The ogre mauls you!'), vitals(T0 + ROUND_MS, 50), lines(T0 + ROUND_MS, 'The ogre mauls you!'));
    const urgent = urgentFor(blind.snapshot(T0 + ROUND_MS));
    expect(urgent?.rationale).toMatch(/about 2 rounds from death while the opponent needs about some/);
  });
});
