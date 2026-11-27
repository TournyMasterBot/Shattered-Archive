import type { FeedEvent } from '@shatteredarchive/copilot-core';
import { makeSituation } from '../testing/situations';
import type { World } from '../world/worlds';
import { createFightGate } from './gate';
import type { MonsterLookup } from './monsterLookup';
import { createFightWatch } from './watch';

const ROOM = 'Market Square'; // the room of makeSituation

function setup(options: { world?: World; found?: boolean; noLookup?: boolean } = {}) {
  const watch = createFightWatch();
  const asked: string[] = [];
  const lookup: MonsterLookup = async (keyword) => {
    asked.push(keyword);
    return { found: options.found ?? false, facts: [] };
  };
  const gate = createFightGate({ watch, world: () => options.world ?? 'dsl', monsterLookup: options.noLookup ? undefined : lookup, now: () => 5_000 });
  const consider = (line: string, keyword = 'goblin') => {
    const events: FeedEvent[] = [
      { type: 'room', at: 1, room: ROOM, sector: 'city', exits: [] },
      { type: 'command', at: 2, command: `consider ${keyword}` },
      { type: 'lines', at: 3, lines: [line] },
    ];
    watch.handle(events);
  };
  return { gate, asked, consider, watch };
}

describe('createFightGate', () => {
  it('lets anything that is not the start of a fight through, and asks nothing', async () => {
    const { gate, asked } = setup();
    expect(await gate(makeSituation(), 'north')).toEqual({ action: 'allow' });
    expect(await gate(makeSituation({ mode: 'battle', game: { inFight: true } }), 'kill goblin')).toEqual({ action: 'allow' });
    expect(asked).toEqual([]);
  });

  it('looks a monster up in the archive first and lets the fight stand when the archive knows it', async () => {
    const { gate, asked } = setup({ found: true });
    expect(await gate(makeSituation(), 'kill goblin')).toEqual({ action: 'allow' });
    expect(asked).toEqual(['goblin']);
    expect(await gate(makeSituation(), 'kill goblin')).toEqual({ action: 'allow' });
    expect(asked).toEqual(['goblin']); // asked once for the room visit
  });

  it('puts a consider in place of a fight on a monster the archive does not know', async () => {
    const { gate, asked } = setup({ found: false });
    const outcome = await gate(makeSituation(), 'kill goblin');
    expect(outcome).toMatchObject({ action: 'replace', command: 'consider goblin' });
    expect((outcome as { rationale: string }).rationale).toMatch(/not identified by the archive.*never start a fight before the monster is identified/);
    expect(asked).toEqual(['goblin']);
  });

  it('allows the fight after the game answered the consider with a fair level, and holds it for a monster too strong', async () => {
    const fair = setup({ found: false });
    await fair.gate(makeSituation(), 'kill goblin');
    fair.consider('The perfect match!');
    expect(await fair.gate(makeSituation(), 'kill goblin')).toEqual({ action: 'allow' });

    const strong = setup({ found: false });
    await strong.gate(makeSituation(), 'kill goblin');
    strong.consider('The goblin laughs at you mercilessly.');
    expect(await strong.gate(makeSituation(), 'kill goblin')).toMatchObject({ action: 'hold', rationale: expect.stringContaining('too strong') });
  });

  it('never asks the DSL archive about a monster of the Simulacrum, and starts with the consider', async () => {
    const { gate, asked, consider } = setup({ world: 'sandbox', found: true });
    expect(await gate(makeSituation(), 'kill goblin')).toMatchObject({ action: 'replace', command: 'consider goblin' });
    consider('The goblin is no match for you.');
    expect(await gate(makeSituation(), 'kill goblin')).toEqual({ action: 'allow' });
    expect(asked).toEqual([]);
  });

  it('goes straight to consider when no archive is configured or the world is not known', async () => {
    const none = setup({ noLookup: true });
    expect(await none.gate(makeSituation(), 'kill goblin')).toMatchObject({ action: 'replace' });
    expect(none.asked).toEqual([]);
    const unknownWorld = createFightGate({ watch: createFightWatch(), world: () => undefined, monsterLookup: async () => ({ found: true, facts: [] }), now: () => 1 });
    expect(await unknownWorld(makeSituation(), 'kill goblin')).toMatchObject({ action: 'replace' });
  });

  it('keeps knowledge per room, and works in a room whose name is not known', async () => {
    const { gate, asked } = setup({ found: true });
    await gate(makeSituation(), 'kill goblin');
    await gate(makeSituation({ game: { room: { name: 'Another Room', sector: 'city', exits: [] } } }), 'kill goblin');
    expect(asked).toEqual(['goblin', 'goblin']);
    const noRoom = makeSituation();
    delete noRoom.game.room;
    expect(await gate(noRoom, 'kill orc')).toEqual({ action: 'allow' });
  });
});
