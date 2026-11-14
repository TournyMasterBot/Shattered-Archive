import type { FeedEvent } from '../log/reducer.js';
import { ConsiderTracker, CONSIDER_ANSWER_MS } from './considerTracker.js';
import { MonsterKnowledge } from './knowledge.js';

const ROOM = 'A dark cave';
const room = (at: number, name = ROOM): FeedEvent => ({ type: 'room', at, room: name, sector: 'inside', exits: ['north'] });
const command = (at: number, text: string): FeedEvent => ({ type: 'command', at, command: text });
const lines = (at: number, ...text: string[]): FeedEvent => ({ type: 'lines', at, lines: text });

function setup() {
  const knowledge = new MonsterKnowledge();
  const tracker = new ConsiderTracker(knowledge);
  return { knowledge, tracker, feed: (...events: FeedEvent[]) => events.forEach((e) => tracker.feed(e)) };
}

describe('ConsiderTracker', () => {
  it('records the answer to a consider for the keyword and the room it was typed in', () => {
    const { knowledge, tracker, feed } = setup();
    feed(room(0), command(1000, 'consider goblin'), lines(1100, '\u001b[1;32mThe goblin looks like an easy kill.\u001b[0m'));
    expect(knowledge.get(ROOM, 'goblin', 1200)?.considered?.result).toMatchObject({ kind: 'band', band: 'easy' });
    expect(tracker.currentRoom()).toBe(ROOM);
  });

  it('knows every way a player types consider, and nothing shorter or longer', () => {
    for (const verb of ['con', 'cons', 'consi', 'consid', 'conside', 'consider', 'CONSIDER']) {
      const { knowledge, feed } = setup();
      feed(room(0), command(10, `${verb} orc`), lines(20, 'The perfect match!'));
      expect(knowledge.get(ROOM, 'orc', 30)).toBeDefined();
    }
    for (const verb of ['co', 'config', 'considerx', 'look']) {
      const { knowledge, feed } = setup();
      feed(room(0), command(10, `${verb} orc`), lines(20, 'The perfect match!'));
      expect(knowledge.get(ROOM, 'orc', 30)).toBeUndefined();
    }
  });

  it('takes the first answer line and skips other text before it', () => {
    const { knowledge, feed } = setup();
    feed(room(0), command(10, 'con 2.orc'), lines(20, 'You look at the orc.', "They're not here."), lines(30, 'The perfect match!'));
    expect(knowledge.get(ROOM, 'orc', 40)?.considered?.result).toEqual({ kind: 'absent' });
  });

  it('records nothing for an answer that comes too late, after another command, after a move or after a close', () => {
    const late = setup();
    late.feed(room(0), command(1000, 'con orc'), lines(1000 + CONSIDER_ANSWER_MS + 1, 'The perfect match!'));
    expect(late.knowledge.size()).toBe(0);

    const other = setup();
    other.feed(room(0), command(1000, 'con orc'), command(1100, 'north'), lines(1200, 'The perfect match!'));
    expect(other.knowledge.size()).toBe(0);

    const moved = setup();
    moved.feed(room(0), command(1000, 'con orc'), room(1100, 'Another room'), lines(1200, 'The perfect match!'));
    expect(moved.knowledge.size()).toBe(0);

    const closed = setup();
    closed.feed(room(0), command(1000, 'con orc'), { type: 'session', at: 1100, state: 'closed' }, lines(1200, 'The perfect match!'));
    expect(closed.knowledge.size()).toBe(0);
    expect(closed.tracker.currentRoom()).toBeUndefined();
  });

  it('records nothing when no room is known yet, and does not record a line that is no answer', () => {
    const noRoom = setup();
    noRoom.feed(command(10, 'con orc'), lines(20, 'The perfect match!'));
    expect(noRoom.knowledge.size()).toBe(0);
    const noAnswer = setup();
    noAnswer.feed(room(0), command(10, 'con orc'), lines(20, 'Something else happens.'));
    expect(noAnswer.knowledge.size()).toBe(0);
    noAnswer.feed(lines(30, 'The perfect match!')); // the command is still waiting: now it is answered
    expect(noAnswer.knowledge.size()).toBe(1);
  });

  it('ignores a consider with no target and other events', () => {
    const { knowledge, feed } = setup();
    feed(room(0), command(10, 'con'), lines(20, 'The perfect match!'), { type: 'login', at: 30, name: 'x' }, { type: 'session', at: 40, state: 'connected' });
    expect(knowledge.size()).toBe(0);
    feed(lines(50, 'The perfect match!')); // no command is pending
    expect(knowledge.size()).toBe(0);
  });
});
