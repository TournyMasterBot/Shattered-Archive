import type { FeedEvent, WhoisicRecord } from '@shatteredarchive/copilot-core';
import { PROMPT, whoisicBlock } from '../testing/whoisicFixtures';
import { createCharacterFeed } from './feed';
import type { CharacterService } from './service';
import { SETTLE_MS } from './whoisicWatcher';

// A recording stand-in for the service: the feed only needs these three methods.
function fakeService() {
  const calls: string[] = [];
  const service = {
    onLogin: async (name: string) => void calls.push(`login:${name}`),
    onSessionClosed: () => void calls.push('closed'),
    onWhoisic: async (record: WhoisicRecord) => void calls.push(`whoisic:${record.name}`),
  } as unknown as CharacterService;
  return { service, calls };
}

const lines = (at: number, ...l: string[]): FeedEvent => ({ type: 'lines', at, lines: l });

describe('createCharacterFeed', () => {
  it('gives each login to the registry and tells it when the session closes, in order', async () => {
    const { service, calls } = fakeService();
    const feed = createCharacterFeed(service);
    await feed.handle([
      { type: 'session', at: 1, state: 'connected' },
      { type: 'login', at: 2, name: 'Velmora', level: 10 },
      { type: 'session', at: 3, state: 'closed' },
      { type: 'login', at: 4, name: 'Thandric' },
    ]);
    expect(calls).toEqual(['login:Velmora', 'closed', 'login:Thandric']);
  });

  it('gives a finished whoisic block to the registry', async () => {
    const { service, calls } = fakeService();
    const feed = createCharacterFeed(service);
    await feed.handle([lines(10, 'text', ...whoisicBlock('Zorvak'), PROMPT)]);
    expect(calls).toEqual(['whoisic:Zorvak']);
  });

  it('keeps a block that is still open until settle() says it has gone quiet', async () => {
    const { service, calls } = fakeService();
    const feed = createCharacterFeed(service);
    await feed.handle([lines(10_000, ...whoisicBlock('Zorvak'))]);
    expect(calls).toEqual([]);
    await feed.settle(10_000 + SETTLE_MS - 1);
    expect(calls).toEqual([]);
    await feed.settle(10_000 + SETTLE_MS);
    expect(calls).toEqual(['whoisic:Zorvak']);
    await feed.settle(10_000 + 2 * SETTLE_MS);
    expect(calls).toEqual(['whoisic:Zorvak']);
  });

  it('does nothing for events it has no use for', async () => {
    const { service, calls } = fakeService();
    await createCharacterFeed(service).handle([
      { type: 'room', at: 1, room: 'A', sector: 'inside', exits: [] },
      { type: 'command', at: 2, command: 'look' },
      { type: 'session', at: 3, state: 'connected' },
    ]);
    expect(calls).toEqual([]);
  });
});
