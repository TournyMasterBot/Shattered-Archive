import { JsonlStore, loadMatrix, validateLesson, validateTicket, type EscalationTicket, type Lesson } from '@shatteredarchive/copilot-core';
import { CharacterService } from '../characters/service';
import { loadConfig, type CopilotServerConfig } from '../config';
import { createFightWatch } from '../fight/watch';
import { createFakeModel } from '../models/fake';
import { Pipeline } from '../tail/pipeline';
import { MemoryFs } from '../testing/memoryFs';
import type { World } from '../world/worlds';
import { createSuggestionParts } from './wiring';

const record = (type: string, payload: unknown, ms: number): string =>
  JSON.stringify({ type, subtype: '', level: 'debug', timestamp: new Date(T0 + ms).toISOString(), payload });
const connect = (ms: number): string => record('game:remote-server:connect', { host: 'h', port: 1 }, ms);
const raw = (text: string, ms: number): string => record('game:remote-server:raw', { type: 'raw', data: `${text}\r\n` }, ms);
// a command echo is a JSON STRING payload in the real log
const input = (text: string, ms: number): string => record('game:client:input', JSON.stringify({ type: 'data', data: text }), ms);
const room = (name: string, ms: number): string => record('game:remote-server:gmcp', { type: 'gmcp', data: `room_data {"room": "${name}", "sector": "inside", "exits": ["N"]}` }, ms);
const char = (hp: number, fighting: boolean, ms: number): string =>
  record('game:remote-server:gmcp', { type: 'gmcp', data: `char_data {"hp": ${hp}, "max_hp": 100, "mana": 10, "max_mana": 10, "move": 10, "max_move": 10, "is_fighting": ${fighting}}` }, ms);

const T0 = Date.UTC(2026, 10, 5, 13, 0, 0);
const kill = JSON.stringify({ command: 'kill goblin', kind: 'fight-start-unknown', sphere: 'fighting', rationale: 'Level up on the goblin.', confidence: 0.9 });

async function setup(options: { archiveUrl?: string; world?: World | undefined; now?: number } = {}) {
  const fs = new MemoryFs();
  const nowMs = options.now ?? T0 + 10_000;
  const characters = (await CharacterService.open({ fs, dir: '/c', matrix: loadMatrix([{ codename: 'Agate', male: 'Zorvak' }]).matrix, now: () => nowMs })).service;
  const watch = createFightWatch();
  const pipeline = new Pipeline({ onFeed: (events) => watch.handle(events) });
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
  const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/l.jsonl', validate: validateLesson });
  const config: CopilotServerConfig = loadConfig({ COPILOT_ENABLED: 'true', COPILOT_MODEL_BACKEND: 'fake', ...(options.archiveUrl ? { COPILOT_ARCHIVE_URL: options.archiveUrl } : {}) });
  const model = createFakeModel([kill, kill, kill]);
  const parts = await createSuggestionParts({ config, characters, pipeline, tickets, lessons, now: () => nowMs, model, fight: { watch, world: () => ('world' in options ? options.world : 'sandbox') } });
  if (parts === undefined) throw new Error('expected parts');
  await characters.onLogin('Velmora');
  return { parts, pipeline, watch, model };
}

describe('the fight rule in the live wiring', () => {
  it('sends a consider instead of a fight on a monster nobody has identified, in the Simulacrum', async () => {
    const t = await setup({ world: 'sandbox' });
    await t.pipeline.ingest([connect(1000), room('A dark cave', 1100), char(100, false, 1200), raw('A goblin is here.', 1300)]);
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(t.parts.service.current()[0]).toMatchObject({ command: 'consider goblin', kind: 'info' });
  });

  it('lets the fight stand once the game has answered a consider in this room with a fair level', async () => {
    const t = await setup({ world: 'sandbox' });
    await t.pipeline.ingest([connect(1000), room('A dark cave', 1100), char(100, false, 1200), input('consider goblin', 1400), raw('The perfect match!', 1500)]);
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(t.parts.service.current()[0]).toMatchObject({ command: 'kill goblin' });
  });

  it('holds a fight on a monster the game says is far too strong', async () => {
    const t = await setup({ world: 'sandbox' });
    await t.pipeline.ingest([connect(1000), room('A dark cave', 1100), char(100, false, 1200), input('consider goblin', 1400), raw('Death will thank you for your gift.', 1500)]);
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(t.parts.service.current()).toEqual([]);
    expect(t.parts.service.counters.held).toBe(1);
  });

  it('looks the monster up in the archive first in the DSL, and fights when it is known', async () => {
    const urls: string[] = [];
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
      urls.push(String(url));
      return { ok: true, json: async () => ({ creatures: [{ name: 'a goblin', level: 5 }] }) };
    }) as unknown as typeof fetch);
    try {
      const t = await setup({ world: 'dsl', archiveUrl: 'https://archive.example' });
      await t.pipeline.ingest([connect(1000), room('A dark cave', 1100), char(100, false, 1200)]);
      t.parts.service.poke();
      await t.parts.service.idle();
      expect(urls.some((u) => u.includes('/api/agent/bestiary?q=goblin'))).toBe(true);
      expect(t.parts.service.current()[0]).toMatchObject({ command: 'kill goblin' });
    } finally {
      spy.mockRestore();
    }
  });

  it('does not ask the archive when the world of the connection is not known', async () => {
    const t = await setup({ world: undefined, archiveUrl: 'https://archive.example' });
    await t.pipeline.ingest([connect(1000), room('A dark cave', 1100), char(100, false, 1200)]);
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(t.parts.service.current()[0]).toMatchObject({ command: 'consider goblin' });
  });
});

describe('a fight in the live wiring', () => {
  it('follows the fight from the log and makes the flee by itself when it is being lost', async () => {
    const t = await setup({ world: 'sandbox', now: T0 + 5_500 });
    await t.pipeline.ingest([
      connect(1000),
      room('A dark cave', 1100),
      char(100, true, 1200),
      raw('You hit the ogre.', 1300),
      raw('The ogre is in excellent condition.', 1301),
      raw('The ogre mauls you!', 1302),
      char(70, true, 4200),
      raw('You hit the ogre.', 4300),
      raw('The ogre has a few scratches.', 4301),
      raw('The ogre mauls you!', 4302),
    ]);
    t.parts.service.poke();
    expect(t.parts.service.current()[0]).toMatchObject({ command: 'flee' });
    expect(t.model.calls).toEqual([]);
  });

  it('shows the model the fight numbers while it is going well', async () => {
    const t = await setup({ world: 'sandbox', now: T0 + 5_000 });
    await t.pipeline.ingest([connect(1000), room('A dark cave', 1100), char(100, true, 1200), raw('You hit the goblin.', 1300), raw('The goblin is in excellent condition.', 1301)]);
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(t.model.calls[0].prompt).toContain('FIGHT (computed from the log');
    expect(t.model.calls[0].prompt).toContain('against the goblin');
  });
});
