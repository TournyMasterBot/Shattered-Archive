import {
  JsonlStore,
  loadMatrix,
  validateLesson,
  validateTicket,
  type EscalationTicket,
  type Lesson,
} from '@shatteredarchive/copilot-core';
import type { Direction } from '@shatteredarchive/shattered-maps-core';
import { CharacterService } from '../characters/service';
import { loadConfig } from '../config';
import { createFakeModel } from '../models/fake';
import { Pipeline } from '../tail/pipeline';
import { MemoryFs } from '../testing/memoryFs';
import { MemoryWorldIo, viewEvents, type ViewSpec } from '../testing/worldFixtures';
import { WorldMemory } from '../world/memory';
import { parseRoomView, type ParsedRoomView } from '../world/parseRoom';
import { createSuggestionParts } from './wiring';

/** The walked map's evidence reaches the movement suggestion the producer builds (Phase 20 replaces the Phase 10 stub). */

const T0 = Date.UTC(2026, 10, 5, 13, 0, 0);
const stamp = (s: number): string => new Date(T0 + s * 1000).toISOString();
const record = (type: string, payload: unknown, s: number): string =>
  JSON.stringify({ type, subtype: '', level: 'debug', timestamp: stamp(s), payload });
const connect = (s: number): string => record('game:remote-server:connect', { host: 'h', port: 1 }, s);
const raw = (text: string, s: number): string =>
  record('game:remote-server:raw', { type: 'raw', data: `${text}\r\n` }, s);
const room = (name: string, s: number): string =>
  record(
    'game:remote-server:gmcp',
    { type: 'gmcp', data: `room_data {"room": "${name}", "sector": "city", "exits": ["N", "E"]}` },
    s,
  );

const view = (spec: ViewSpec): ParsedRoomView => parseRoomView(viewEvents(1, spec)) as ParsedRoomView;
const ctx = (day: string, arrivalDir?: Direction) => ({
  day,
  session: `${day}:Agate-F`,
  ...(arrivalDir ? { arrivalDir } : {}),
});

async function suggestionFor(command: string, walk: (memory: WorldMemory) => Promise<void>, roomName = 'Hall') {
  const { memory } = await WorldMemory.open({
    io: new MemoryWorldIo(),
    file: '/w.json',
    baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
    random: (() => {
      let n = 0;
      return () => ((n += 1) * 0.137) % 1;
    })(),
  });
  await walk(memory);
  const fs = new MemoryFs();
  const characters = (
    await CharacterService.open({
      fs,
      dir: '/c',
      matrix: loadMatrix([{ codename: 'Agate', male: 'Zorvak' }]).matrix,
      now: () => T0 + 10_000,
    })
  ).service;
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({
    fs,
    path: '/t.jsonl',
    validate: validateTicket,
  });
  const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/l.jsonl', validate: validateLesson });
  const pipeline = new Pipeline();
  const model = createFakeModel([
    JSON.stringify({ command, kind: 'move', sphere: 'world', rationale: 'Go that way.', confidence: 0.99 }),
  ]);
  const asked: [string | undefined, string][] = [];
  const parts = await createSuggestionParts({
    config: loadConfig({ COPILOT_ENABLED: 'true', COPILOT_MODEL_BACKEND: 'fake' }),
    characters,
    pipeline,
    tickets,
    lessons,
    now: () => T0 + 10_000,
    model,
    mapEvidence: (title, cmd) => {
      asked.push([title, cmd]);
      return memory.edgeEvidence(title, cmd);
    },
  });
  if (parts === undefined) throw new Error('expected a model');
  await characters.onLogin('Velmora');
  await pipeline.ingest([connect(7), room(roomName, 8), raw('text', 9)]);
  parts.service.poke();
  await parts.service.idle();
  return { suggestion: parts.service.current()[0], asked };
}

const walkedBothWays = async (memory: WorldMemory): Promise<void> => {
  await memory.apply(view({ title: 'Hall', gmcpExits: ['N', 'E'] }), ctx('2026-11-01'));
  await memory.apply(view({ title: 'Study', gmcpExits: ['S'] }), ctx('2026-11-01', 'N'));
  await memory.apply(view({ title: 'Hall', gmcpExits: ['N', 'E'] }), ctx('2026-11-01', 'S'));
};

describe("a movement suggestion carries the walked map's evidence", () => {
  it("an exit walked there and back gives a high confidence from the map, not from the model's 0.99", async () => {
    const { suggestion, asked } = await suggestionFor('north', walkedBothWays);
    expect(suggestion).toMatchObject({
      command: 'north',
      kind: 'move',
      confidence: 0.95,
      confidenceSource: 'map-evidence',
    });
    expect(asked).toEqual([['Hall', 'north']]);
  });

  it('an exit walked once gives a low confidence', async () => {
    const { suggestion } = await suggestionFor('north', async (memory) => {
      await memory.apply(view({ title: 'Hall', gmcpExits: ['N', 'E'] }), ctx('2026-11-01'));
      await memory.apply(view({ title: 'Study', gmcpExits: ['S'] }), ctx('2026-11-01', 'N'));
      await memory.apply(view({ title: 'Hall', gmcpExits: ['N', 'E'] }), ctx('2026-11-02')); // back in the hall, but not by walking south
    });
    expect(suggestion).toMatchObject({ command: 'north', confidence: 0.6, confidenceSource: 'map-evidence' });
  });

  it('an exit that was never walked gives no confidence, so it asks', async () => {
    const { suggestion } = await suggestionFor('east', walkedBothWays);
    expect(suggestion).toMatchObject({ command: 'east', confidence: null, confidenceSource: 'map-evidence' });
  });

  it('a room the map has not seen gives no confidence', async () => {
    const { suggestion } = await suggestionFor('north', walkedBothWays, 'Market Square');
    expect(suggestion.confidence).toBeNull();
  });

  it('without a map the evidence is none: every movement asks', async () => {
    const north = JSON.stringify({
      command: 'north',
      kind: 'move',
      sphere: 'world',
      rationale: 'Go.',
      confidence: 0.99,
    });
    const fs = new MemoryFs();
    const characters = (
      await CharacterService.open({
        fs,
        dir: '/c',
        matrix: loadMatrix([{ codename: 'Agate', male: 'Zorvak' }]).matrix,
        now: () => T0 + 10_000,
      })
    ).service;
    const { store: tickets } = await JsonlStore.open<EscalationTicket>({
      fs,
      path: '/t.jsonl',
      validate: validateTicket,
    });
    const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/l.jsonl', validate: validateLesson });
    const pipeline = new Pipeline();
    const parts = await createSuggestionParts({
      config: loadConfig({ COPILOT_ENABLED: 'true', COPILOT_MODEL_BACKEND: 'fake' }),
      characters,
      pipeline,
      tickets,
      lessons,
      now: () => T0 + 10_000,
      model: createFakeModel([north]),
    });
    await characters.onLogin('Velmora');
    await pipeline.ingest([connect(7), room('Hall', 8), raw('text', 9)]);
    parts!.service.poke();
    await parts!.service.idle();
    expect(parts!.service.current()[0]).toMatchObject({ confidence: null, confidenceSource: 'map-evidence' });
  });
});
