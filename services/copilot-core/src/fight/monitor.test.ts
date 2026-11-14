import type { FeedEvent } from '../log/reducer.js';
import { CRITICAL_ROUNDS, FightMonitor, FLEE_BELOW_PCT, IDLE_END_MS, RELIABLE_ROUNDS, ROUND_MS } from './monitor.js';

const T0 = 1_000_000;
const lines = (at: number, ...text: string[]): FeedEvent => ({ type: 'lines', at, lines: text });
const vitals = (at: number, hp: number, inFight = true, maxHp = 100): FeedEvent => ({
  type: 'vitals',
  at,
  inFight,
  vitals: { hp, maxHp, mana: 50, maxMana: 50, move: 100, maxMove: 100 },
});
const round = (n: number): number => T0 + n * ROUND_MS;
const feed = (m: FightMonitor, ...events: FeedEvent[]): FightMonitor => {
  for (const e of events) m.feed(e);
  return m;
};

/** A fight the character is winning: it hits for about 10 a round, takes nothing, and the goblin looks worse each round. */
function winning(): FightMonitor {
  return feed(
    new FightMonitor(),
    vitals(round(0), 100),
    lines(round(0), 'You hit the goblin.', 'The goblin is in excellent condition.'),
    lines(round(1), 'You hit the goblin.', 'The goblin has quite a few wounds.'),
  );
}

describe('constants from the game source', () => {
  it('a round is three seconds (PULSE_VIOLENCE is 3 * 4 pulses at four a second)', () => {
    expect(ROUND_MS).toBe(3000);
  });
});

describe('FightMonitor: no fight', () => {
  it('says there is no fight and gives no advice', () => {
    const m = new FightMonitor();
    expect(m.snapshot(T0)).toMatchObject({ active: false, advice: 'none', outcome: 'unknown', rounds: 0, roundsToKill: null, roundsToDie: null });
    expect(m.result()).toBeUndefined();
  });

  it('ignores text that is not about a fight, and events that are not game text', () => {
    const m = feed(
      new FightMonitor(),
      lines(T0, 'You say hello.', 'The goblin is in excellent condition.', 'The goblin is DEAD!!', 'You flee from combat!', ''),
      { type: 'login', at: T0, name: 'x' },
      { type: 'command', at: T0, command: 'flee' },
      vitals(T0, 100, false),
      { type: 'room', at: T0, room: 'A road', sector: 'city', exits: [] },
      { type: 'session', at: T0, state: 'closed' },
    );
    expect(m.snapshot(T0).active).toBe(false);
    expect(m.result()).toBeUndefined();
  });
});

describe('FightMonitor: a fight being won', () => {
  it('estimates the opponent from what was dealt and how hurt it looks, and says to keep going', () => {
    const snap = winning().snapshot(round(1));
    expect(snap).toMatchObject({ active: true, opponent: 'the goblin', rounds: 2, hits: 2, misses: 0, reliable: true, outcome: 'winning', advice: 'continue', projected: false });
    expect(snap.dealtPerRound).toBeCloseTo(10.5);
    expect(snap.opponentPct).toBe(62);
    // 21 damage did 38% of its hit points: about 55 in all, 34 left, 3.3 rounds at 10.5 a round
    expect(snap.roundsToKill).toBeCloseTo(3.27, 1);
    expect(snap.roundsToDie).toBeNull();
    expect(snap.opponentCondition).toMatchObject({ name: 'The goblin', minPct: 50, maxPct: 74 });
  });

  it('says to finish it when it is within two rounds of dying', () => {
    const m = winning();
    m.feed(lines(round(2), 'You hit the goblin.', 'The goblin has some big nasty wounds and scratches.'));
    const snap = m.snapshot(round(2));
    expect(snap.roundsToKill).toBeLessThan(2.01);
    expect(snap).toMatchObject({ advice: 'finish', outcome: 'winning' });
  });

  it('is not trusted before it has two rounds and a condition, and then has no kill estimate', () => {
    const first = feed(new FightMonitor(), lines(round(0), 'You hit the goblin.', 'The goblin has quite a few wounds.')).snapshot(round(0));
    // one blow and one sentence say the goblin is near death, but that is not enough to tell anyone to "finish" it
    expect(first).toMatchObject({ rounds: 1, reliable: false, outcome: 'unknown', advice: 'continue' });
    expect(RELIABLE_ROUNDS).toBe(2);
    const noCondition = feed(new FightMonitor(), lines(round(0), 'You hit the goblin.'), lines(round(1), 'You hit the goblin.')).snapshot(round(1));
    expect(noCondition).toMatchObject({ rounds: 2, reliable: false, roundsToKill: null });
    expect(noCondition.opponentPct).toBeUndefined();
    const untouched = feed(new FightMonitor(), lines(round(0), 'You miss the goblin.', 'The goblin is in excellent condition.'), lines(round(1), 'You miss the goblin.')).snapshot(round(1));
    expect(untouched).toMatchObject({ reliable: false, roundsToKill: null, opponentPct: 100, hits: 0, misses: 2 });
  });

  it('keeps the damage of a hurt opponent that someone else wounded as only a percent', () => {
    const m = feed(new FightMonitor(), lines(round(0), 'You miss the goblin.', 'The goblin looks pretty hurt.'));
    expect(m.snapshot(round(0))).toMatchObject({ opponentPct: 22, roundsToKill: null });
  });
});

describe('FightMonitor: a fight being lost', () => {
  function losing(): FightMonitor {
    return feed(
      new FightMonitor(),
      vitals(round(0), 100),
      lines(round(0), 'You hit the ogre.', 'The ogre is in excellent condition.', 'The ogre mauls you!'),
      vitals(round(1), 70),
      lines(round(1), 'You hit the ogre.', 'The ogre has a few scratches.', 'The ogre mauls you!'),
    );
  }

  it('uses the hit points the character really lost, projects the rounds to death and says to flee', () => {
    const snap = losing().snapshot(round(1));
    // 30 hit points in 2 rounds: 15 a round, 70 left: under 5 rounds, while the ogre needs far longer
    expect(snap.takenPerRound).toBeCloseTo(15);
    expect(snap.roundsToDie).toBeCloseTo(70 / 15, 1);
    expect(snap).toMatchObject({ hp: 70, maxHp: 100, hpPct: 70, outcome: 'losing', advice: 'flee', reliable: true });
  });

  it('says to flee two rounds from death when the opponent is not about to die, and ignores talk in the middle of a fight', () => {
    const m = feed(
      new FightMonitor(),
      vitals(round(0), 100),
      lines(round(0), 'You hit the ogre.', 'The ogre is in excellent condition.', 'The ogre mauls you!'),
      vitals(round(1), 50),
      lines(round(1), 'You hit the ogre.', 'The ogre has quite a few wounds.', 'The ogre mauls you!', 'You say hello.'),
    );
    const snap = m.snapshot(round(1));
    expect(snap.roundsToDie).toBeCloseTo(2);
    expect(snap.roundsToKill).toBeGreaterThan(1);
    expect(snap).toMatchObject({ advice: 'flee', hpPct: 50 });
  });

  it('says to flee below a quarter of the hit points, whatever the rest says', () => {
    const m = feed(new FightMonitor(), vitals(round(0), 100), lines(round(0), 'You hit the rat.'), vitals(round(1), FLEE_BELOW_PCT - 1));
    expect(m.snapshot(round(1))).toMatchObject({ advice: 'flee' });
    expect(FLEE_BELOW_PCT).toBe(25);
  });

  it('takes the damage from the blows when no hit points are known, or when they went up', () => {
    const text = feed(new FightMonitor(), lines(round(0), 'The ogre mauls you!', 'You hit the ogre.'), lines(round(1), 'The ogre mauls you!')).snapshot(round(1));
    expect(text.takenPerRound).toBeCloseTo(22.5);
    expect(text.hp).toBeUndefined();
    expect(text.roundsToDie).toBeNull();
    const healed = feed(new FightMonitor(), vitals(round(0), 50), lines(round(0), 'The ogre hits you.'), vitals(round(1), 90)).snapshot(round(1));
    expect(healed.takenPerRound).toBeCloseTo(10.5 / 2);
  });

  it('is losing when the character is two rounds from death and there is nothing to compare with', () => {
    const m = feed(new FightMonitor(), vitals(round(0), 100), lines(round(0), 'The ogre mauls you!'), vitals(round(0) + 1, 40), lines(round(0), 'The ogre mauls you!'));
    const snap = m.snapshot(round(0));
    expect(CRITICAL_ROUNDS).toBe(2);
    expect(snap.roundsToDie).toBeLessThanOrEqual(CRITICAL_ROUNDS + 1);
    expect(snap.reliable).toBe(false);
    expect(snap.advice).toBe('flee');
  });

  it('does not flee near death when the opponent dies first, and calls an even fight even', () => {
    const m = feed(
      new FightMonitor(),
      vitals(round(0), 100),
      lines(round(0), 'You hit the imp.', 'The imp is in excellent condition.', 'The imp hits you.'),
      vitals(round(1), 55),
      lines(round(1), 'You hit the imp.', 'The imp is in awful condition.', 'The imp hits you.'),
    );
    const snap = m.snapshot(round(1));
    expect(snap.roundsToKill).toBeLessThan(1);
    expect(snap.advice).not.toBe('flee');
    const even = feed(
      new FightMonitor(),
      vitals(round(0), 100),
      lines(round(0), 'You hit the troll.', 'The troll is in excellent condition.', 'The troll hits you.'),
      vitals(round(1), 85),
      lines(round(1), 'You hit the troll.', 'The troll has some small wounds and bruises.', 'The troll hits you.'),
    ).snapshot(round(1));
    // the troll needs about 9 more rounds, the character has about 11: neither side is far enough ahead to call
    expect(even.roundsToKill).toBeCloseTo(9.1, 1);
    expect(even.roundsToDie).toBeCloseTo(11.3, 1);
    expect(even).toMatchObject({ outcome: 'even', advice: 'continue' });
  });
});

describe('FightMonitor: the projection while a slow reader catches up', () => {
  it('moves the fight forward to the time asked: fewer hit points, a more hurt opponent, a later round', () => {
    const m = feed(
      winning(),
      vitals(round(1), 80),
      lines(round(1), 'The goblin hits you.'),
    );
    const now = m.snapshot(round(1));
    const later = m.snapshot(round(1) + 2 * ROUND_MS);
    expect(now.projected).toBe(false);
    expect(later.projected).toBe(true);
    expect(later.behindRounds).toBeCloseTo(2);
    expect(later.roundNow).toBe(now.roundNow + 2);
    expect(later.hp as number).toBeLessThan(now.hp as number);
    expect(later.opponentPct as number).toBeLessThan(now.opponentPct as number);
    expect(later.roundsToKill as number).toBeLessThan(now.roundsToKill as number);
  });

  it('never projects below zero hit points', () => {
    const m = feed(new FightMonitor(), vitals(round(0), 20), lines(round(0), 'The ogre *** DEVASTATES *** you!'), vitals(round(1), 10), lines(round(1), 'The ogre hits you.'));
    const snap = m.snapshot(round(1) + 3 * ROUND_MS);
    expect(snap.hp).toBe(0);
    expect(snap.advice).toBe('flee');
  });

  it('closes a fight nobody has written to for four rounds as idle', () => {
    const m = winning();
    expect(m.snapshot(round(1) + IDLE_END_MS - 1).active).toBe(true);
    expect(m.snapshot(round(1) + IDLE_END_MS).active).toBe(false);
    expect(m.result()).toMatchObject({ end: 'idle', opponent: 'the goblin' });
  });
});

describe('FightMonitor: how a fight ends', () => {
  it('is won when the opponent is dead, and keeps the experience the game reports after it', () => {
    const m = winning();
    m.feed(lines(round(2), 'You hit the goblin.', 'The goblin is DEAD!!', 'You receive 120 experience points.'));
    expect(m.snapshot(round(2)).active).toBe(false);
    expect(m.result()).toMatchObject({ end: 'won', opponent: 'the goblin', rounds: 3, experience: 120 });
    m.feed(lines(round(2), 'You receive 7 experience points.'));
    expect(m.result()?.experience).toBe(7);
  });

  it('keeps experience that came before the death line, and ignores experience when there was no fight', () => {
    const m = winning();
    m.feed(lines(round(2), 'You receive 55 experience points.', 'The goblin is DEAD!!'));
    expect(m.result()).toMatchObject({ end: 'won', experience: 55 });
    const none = new FightMonitor();
    none.feed(lines(T0, 'You receive 10 experience points.'));
    expect(none.result()).toBeUndefined();
  });

  it('has no opponent and no hit point loss in the result of a fight only the game flag spoke of', () => {
    const m = feed(new FightMonitor(), vitals(round(0), 100, true), vitals(round(2), 100, false));
    const result = m.result() as NonNullable<ReturnType<FightMonitor['result']>>;
    expect(result).toMatchObject({ end: 'idle', hpLost: 0, rounds: 1 });
    expect(result.opponent).toBeUndefined();
    const blind = feed(new FightMonitor(), lines(round(0), 'The ogre hits you.'));
    blind.snapshot(round(0) + IDLE_END_MS);
    expect(blind.result()?.hpLost).toBeUndefined();
  });

  it('is not ended by the death of some other creature', () => {
    const m = winning();
    m.feed(lines(round(2), 'The rat is DEAD!!', 'The rat looks pretty hurt.'));
    expect(m.snapshot(round(2)).active).toBe(true);
    expect(m.snapshot(round(2)).opponentCondition?.name).toBe('The goblin');
  });

  it('is lost when the character is killed, and records the hit points it lost', () => {
    const m = feed(new FightMonitor(), vitals(round(0), 90), lines(round(0), 'The ogre mauls you!'), vitals(round(1), 5), lines(round(1), 'You have been KILLED!!'));
    expect(m.result()).toMatchObject({ end: 'lost', hpLost: 85 });
  });

  it('is fled when the game says so, and a failed flee is counted', () => {
    const m = winning();
    m.feed({ type: 'command', at: round(2), command: 'flee' });
    m.feed(lines(round(2), "PANIC! You couldn't escape!"));
    expect(m.snapshot(round(2)).fleeFailures).toBe(1);
    m.feed(lines(round(3), 'You flee from combat!'));
    expect(m.result()).toMatchObject({ end: 'fled' });
    expect(m.snapshot(round(3)).fleeFailures).toBe(0);
  });

  it('is left when the room or the connection changes', () => {
    const a = winning();
    a.feed({ type: 'room', at: round(2), room: 'Elsewhere', sector: 'city', exits: [] });
    expect(a.result()).toMatchObject({ end: 'left' });
    const b = winning();
    b.feed({ type: 'session', at: round(2), state: 'closed' });
    expect(b.result()).toMatchObject({ end: 'left' });
  });

  it('closes a fight when the game says it is no longer one, only after a quiet round, and calls it fled after a flee command', () => {
    const quick = winning();
    quick.feed(vitals(round(1) + 100, 100, false));
    expect(quick.snapshot(round(1) + 100).active).toBe(true);
    quick.feed(vitals(round(2) + 200, 100, false));
    expect(quick.result()).toMatchObject({ end: 'idle' });
    const fled = winning();
    fled.feed({ type: 'command', at: round(1) + 50, command: ' FLEE ' });
    fled.feed(vitals(round(3), 100, false));
    expect(fled.result()).toMatchObject({ end: 'fled' });
  });

  it('starts a new fight from a vitals event that says so, and forgets the last result when it does', () => {
    const m = winning();
    m.feed(lines(round(2), 'The goblin is DEAD!!'));
    expect(m.result()).toBeDefined();
    m.feed(vitals(round(5), 100, true));
    expect(m.result()).toBeUndefined();
    expect(m.snapshot(round(5))).toMatchObject({ active: true, rounds: 1 });
  });

  it('counts a blow from a second attacker as damage taken, and does not take another creature\'s condition', () => {
    const m = feed(new FightMonitor(), lines(round(0), 'You hit the goblin.', 'The goblin hits you.', 'The orc hits you.', 'The orc is in awful condition.'));
    const snap = m.snapshot(round(0));
    expect(snap.takenPerRound).toBeCloseTo(21);
    expect(snap.opponentCondition).toBeUndefined();
  });

  it('takes the opponent from the condition line when no blow named it', () => {
    const m = feed(new FightMonitor(), vitals(round(0), 100), lines(round(0), 'The goblin has a few scratches.'));
    expect(m.snapshot(round(0)).opponent).toBe('The goblin');
  });
});
