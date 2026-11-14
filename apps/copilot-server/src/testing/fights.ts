import { FightMonitor, ROUND_MS, type FeedEvent, type FightSnapshot } from '@shatteredarchive/copilot-core';

const T0 = 1_000_000;
const vitals = (at: number, hp: number): FeedEvent => ({ type: 'vitals', at, inFight: true, vitals: { hp, maxHp: 100, mana: 1, maxMana: 1, move: 1, maxMove: 1 } });
const lines = (at: number, ...text: string[]): FeedEvent => ({ type: 'lines', at, lines: text });

/** Fight snapshots for tests, made by the real monitor from game text. Test helper: excluded from the build. */
export function fightSnapshot(kind: 'winning' | 'losing', extraRounds = 0): FightSnapshot {
  const m = new FightMonitor();
  const events: FeedEvent[] =
    kind === 'losing'
      ? [
          vitals(T0, 100),
          lines(T0, 'You hit the ogre.', 'The ogre is in excellent condition.', 'The ogre mauls you!'),
          vitals(T0 + ROUND_MS, 70),
          lines(T0 + ROUND_MS, 'You hit the ogre.', 'The ogre has a few scratches.', 'The ogre mauls you!'),
        ]
      : [vitals(T0, 100), lines(T0, 'You hit the goblin.', 'The goblin is in excellent condition.'), lines(T0 + ROUND_MS, 'You hit the goblin.', 'The goblin has quite a few wounds.')];
  for (const e of events) m.feed(e);
  // the last event is at T0 + one round; `extraRounds` asks for the projection that many rounds later
  return m.snapshot(T0 + ROUND_MS + extraRounds * ROUND_MS);
}
