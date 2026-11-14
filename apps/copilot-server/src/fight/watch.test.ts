import type { FeedEvent } from '@shatteredarchive/copilot-core';
import { createFightWatch } from './watch';

const room = (at: number): FeedEvent => ({ type: 'room', at, room: 'A dark cave', sector: 'inside', exits: ['north'] });
const command = (at: number, text: string): FeedEvent => ({ type: 'command', at, command: text });
const lines = (at: number, ...text: string[]): FeedEvent => ({ type: 'lines', at, lines: text });

describe('createFightWatch', () => {
  it('learns what a consider answered, for the room the character is in', () => {
    const watch = createFightWatch();
    watch.handle([room(0), command(1000, 'consider goblin'), lines(1100, 'The goblin looks like an easy kill.')]);
    expect(watch.room()).toBe('A dark cave');
    expect(watch.knowledge.get('A dark cave', 'goblin', 1200)?.considered?.result).toMatchObject({ kind: 'band', band: 'easy' });
  });

  it('follows a fight from the same events, and says there is none when there is none', () => {
    const watch = createFightWatch();
    expect(watch.fight(0).active).toBe(false);
    watch.handle([lines(5000, 'You hit the goblin.', 'The goblin hits you.'), lines(8000, 'You hit the goblin.')]);
    expect(watch.fight(8000)).toMatchObject({ active: true, opponent: 'the goblin', hits: 2 });
  });

  it('forgets the room when the connection closes', () => {
    const watch = createFightWatch();
    watch.handle([room(0), { type: 'session', at: 10, state: 'closed' }]);
    expect(watch.room()).toBeUndefined();
  });
});
