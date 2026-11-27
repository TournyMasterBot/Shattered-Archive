import { ConsiderTracker, FightMonitor, MonsterKnowledge, type FeedEvent, type FightSnapshot } from '@shatteredarchive/copilot-core';

/**
 * Everything Copilot learns about fights from the log feed, in one place: what it knows about the monsters in front of it, what `consider`
 * answered, and where the fight in progress is going. It is fed every batch of feed events by the pipeline (the same events the world memory
 * and the character registry see), costs no model call, and answers from memory, so a slow model never holds it up.
 */
export interface FightWatch {
  /** Feed a batch of feed events, in order. */
  handle(events: readonly FeedEvent[]): void;
  readonly knowledge: MonsterKnowledge;
  /** The room the character is in, as the last room event named it. */
  room(): string | undefined;
  /** Where the fight in progress is at `now`, projected to that time (inactive when there is none). */
  fight(now: number): FightSnapshot;
}

export function createFightWatch(): FightWatch {
  const knowledge = new MonsterKnowledge();
  const tracker = new ConsiderTracker(knowledge);
  const monitor = new FightMonitor();
  return {
    handle(events) {
      for (const event of events) {
        tracker.feed(event);
        monitor.feed(event);
      }
    },
    knowledge,
    room: () => tracker.currentRoom(),
    fight: (now) => monitor.snapshot(now),
  };
}
