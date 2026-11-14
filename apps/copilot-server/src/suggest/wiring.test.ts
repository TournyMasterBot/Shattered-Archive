import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonlStore, loadMatrix, validateLesson, validateTicket, type Decision, type EscalationTicket, type Lesson } from '@shatteredarchive/copilot-core';
import { CharacterService } from '../characters/service';
import { createFakeModel } from '../models/fake';
import type { ModelClient } from '../models/types';
import { loadConfig, type CopilotServerConfig } from '../config';
import { Pipeline } from '../tail/pipeline';
import { MemoryFs } from '../testing/memoryFs';
import { readSpheres } from './spheres';
import { createModel, createSuggestionParts } from './wiring';

const record = (type: string, payload: unknown, s: number): string =>
  JSON.stringify({ type, subtype: '', level: 'debug', timestamp: new Date(Date.UTC(2026, 10, 5, 13, 0, s)).toISOString(), payload });
const connect = (s: number): string => record('game:remote-server:connect', { host: 'h', port: 1 }, s);
const raw = (text: string, s: number): string => record('game:remote-server:raw', { type: 'raw', data: `${text}\r\n` }, s);
const room = (name: string, s: number): string => record('game:remote-server:gmcp', { type: 'gmcp', data: `room_data {"room": "${name}", "sector": "city", "exits": ["N"]}` }, s);
const T0 = Date.UTC(2026, 10, 5, 13, 0, 0);
const base = { COPILOT_ENABLED: 'true', COPILOT_MODEL_BACKEND: 'fake' };
const withEnv = (extra: Record<string, string> = {}): CopilotServerConfig => loadConfig({ ...base, ...extra });

async function setup(config: CopilotServerConfig, nowMs = T0 + 10_000, model?: ModelClient, extra: Partial<Parameters<typeof createSuggestionParts>[0]> = {}) {
  const fs = new MemoryFs();
  const matrix = loadMatrix([{ codename: 'Agate', male: 'Zorvak' }]).matrix;
  const characters = (await CharacterService.open({ fs, dir: '/c', matrix, now: () => nowMs })).service;
  const pipeline = new Pipeline();
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
  const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/l.jsonl', validate: validateLesson });
  const parts = await createSuggestionParts({ config, characters, pipeline, tickets, lessons, now: () => nowMs, model, ...extra });
  if (parts === undefined) throw new Error('expected a model');
  return { parts, pipeline, characters, tickets, lessons };
}

describe('createModel', () => {
  it('is nothing for none, the fake for fake, and a local Ollama client for ollama', () => {
    expect(createModel(loadConfig({ COPILOT_ENABLED: 'true' }))).toBeUndefined();
    expect(createModel(withEnv())).toBeDefined();
    expect(
      createModel(withEnv({ COPILOT_MODEL_BACKEND: 'ollama', COPILOT_OLLAMA_URL: 'http://localhost:11434', COPILOT_WATCHER_MODEL: 'a', COPILOT_AGENT_MODEL: 'b' })),
    ).toBeDefined();
  });
});

describe('createSuggestionParts', () => {
  it('is undefined without a model, so only the registry offer exists', async () => {
    const fs = new MemoryFs();
    const characters = (await CharacterService.open({ fs, dir: '/c', matrix: undefined, now: () => 1 })).service;
    const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
    const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/l.jsonl', validate: validateLesson });
    const config = loadConfig({ COPILOT_ENABLED: 'true' });
    expect(await createSuggestionParts({ config, characters, pipeline: new Pipeline(), tickets, lessons })).toBeUndefined();
  });

  it('proposes nothing until a character is logged in, the session is connected and the log is fresh', async () => {
    const t = await setup(withEnv());
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(t.parts.service.current()).toEqual([]); // nobody logged in

    await t.characters.onLogin('Velmora');
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(t.parts.service.current()).toEqual([]); // not connected

    await t.pipeline.ingest([connect(8), room('Market Square', 8), raw('You are in a square.', 8)]);
    const stale = await setup(withEnv(), T0 + 8_000 + 61_000);
    await stale.characters.onLogin('Velmora');
    await stale.pipeline.ingest([connect(8), raw('text', 8)]);
    stale.parts.service.poke();
    await stale.parts.service.idle();
    expect(stale.parts.service.current()).toEqual([]); // the log went quiet
  });

  it('produces a suggestion for the live situation, shows the model codenames instead of names, and stores it', async () => {
    const t = await setup(withEnv());
    await t.characters.onLogin('Velmora');
    await t.pipeline.ingest([connect(7), room('Market Square', 8), raw('Velmora says hello to Zorvak.', 9)]);
    t.parts.service.poke();
    await t.parts.service.idle();

    const [suggestion] = t.parts.service.current();
    expect(suggestion).toMatchObject({ character: 'Antlia-U', mode: 'exploration', command: 'look', kind: 'info', confidenceSource: 'model', situationKey: 'exploration:market-square' });
    expect(t.parts.service.find(suggestion.id)).toBe(suggestion);
  });

  it('asks the hint tiers about the room for every suggestion and puts what they say in the prompt', async () => {
    const prompts: string[] = [];
    const model: ModelClient = {
      generate: async (_role, prompt) => (prompts.push(prompt), { ok: true, text: JSON.stringify({ command: 'look', kind: 'info', sphere: 'world', rationale: 'Look.', confidence: 0.9 }) }),
    } as ModelClient;
    const asked: unknown[] = [];
    const hints = { hint: async (r: unknown) => (asked.push(r), { tier: 'instant' as const, commands: ['look fountain'], notes: [], tried: ['learned' as const, 'instant' as const], ms: 1 }) };
    const t = await setup(withEnv(), T0 + 10_000, model, { hints });
    await t.characters.onLogin('Velmora');
    await t.pipeline.ingest([connect(7), room('Market Square', 8), raw('Market Square', 8), raw('A busy square.', 9), raw('[Exits: north]', 9)]);
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(asked).toEqual([expect.objectContaining({ title: 'Market Square', exits: ['N'], description: 'A busy square.' })]);
    expect(prompts[0]).toContain('HINTS FOR THIS ROOM');
    expect(prompts[0]).toContain('- Hint (instant): look fountain');
  });

  it('turns a correction into a proposed lesson through the same fake model', async () => {
    const t = await setup(withEnv());
    await t.characters.onLogin('Velmora');
    await t.pipeline.ingest([connect(7), room('Market Square', 8), raw('text', 9)]);
    t.parts.service.poke();
    await t.parts.service.idle();
    const suggestion = t.parts.service.current()[0];

    const decision: Decision = { id: 'd-1', suggestionId: suggestion.id, character: suggestion.character, at: T0, outcome: 'corrected', command: 'north', why: 'The way out is north' };
    expect(await t.parts.corrections.handle(decision)).toBe('lesson');
    expect(t.lessons.query()).toMatchObject([{ status: 'proposed', situationKey: 'exploration:market-square', sourceDecisionId: 'd-1' }]);
  });

  it('a movement suggestion has no confidence yet: the map evidence is a stub that always asks', async () => {
    const north = JSON.stringify({ command: 'north', kind: 'move', sphere: 'world', rationale: 'The exit is north.', confidence: 0.99 });
    const t = await setup(withEnv(), T0 + 10_000, createFakeModel([north]));
    await t.characters.onLogin('Velmora');
    await t.pipeline.ingest([connect(7), room('Market Square', 8), raw('text', 9)]);
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(t.parts.service.current()[0]).toMatchObject({ command: 'north', kind: 'move', confidence: null, confidenceSource: 'map-evidence' });
  });

  it('a spheres file’s hint for a wrong turn reaches the wrong-sphere ticket; without the file the ticket has no hint', async () => {
    const map = {
      spheres: Object.fromEntries(
        ['world', 'fighting', 'interaction', 'things'].map((s) => [s, { neighbours: s === 'world' ? ['things'] : ['world'], misrouteHint: s === 'world' ? { things: 'A room question may be about the items in it.' } : {} }]),
      ),
    };
    const dir = mkdtempSync(path.join(tmpdir(), 'copilot-spheres-'));
    try {
      writeFileSync(path.join(dir, 'spheres.json'), JSON.stringify(map));
      const script = () => createFakeModel([JSON.stringify({ wrongSphere: 'things' }), JSON.stringify({ command: 'inventory', kind: 'info', sphere: 'things', rationale: 'Check the bag.', confidence: 0.9 })]);
      const withFile = await setup(withEnv({ COPILOT_SPHERES_PATH: path.join(dir, 'spheres.json') }), T0 + 10_000, script());
      await withFile.characters.onLogin('Velmora');
      await withFile.pipeline.ingest([connect(7), room('Market Square', 8), raw('text', 9)]);
      withFile.parts.service.poke();
      await withFile.parts.service.idle();
      expect(withFile.tickets.query().map((t) => t.summary)).toEqual(['The model said this belongs to the things sphere, not world. Hint: A room question may be about the items in it.']);

      const builtIn = await setup(withEnv(), T0 + 10_000, script());
      await builtIn.characters.onLogin('Velmora');
      await builtIn.pipeline.ingest([connect(7), room('Market Square', 8), raw('text', 9)]);
      builtIn.parts.service.poke();
      await builtIn.parts.service.idle();
      expect(builtIn.tickets.query().map((t) => t.summary)).toEqual(['The model said this belongs to the things sphere, not world']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads the real Shattered-AI sphere map when that repository is next to this one', async () => {
    const file = path.resolve(__dirname, '../../../../../Shattered-AI/tools/archive-mcp/experts/spheres.json');
    if (!existsSync(file)) return; // a clone without the sibling repository: nothing to read
    const table = await readSpheres(file);
    expect([...table.neighbours('world')].sort()).toEqual(['fighting', 'interaction']);
    expect([...table.neighbours('fighting')].sort()).toEqual(['interaction', 'things', 'world']);
    expect(table.misrouteHint('world', 'fighting')).toMatch(/creatures/);
    expect(table.misrouteHint('world', 'things')).toBeUndefined(); // not neighbours
  });

  it('reads an optional spheres file and archive URL (an absent file keeps the built-in table; an unreachable archive means no facts)', async () => {
    const t = await setup(withEnv({ COPILOT_SPHERES_PATH: '/nowhere/spheres.json', COPILOT_ARCHIVE_URL: 'http://127.0.0.1:1' }));
    await t.characters.onLogin('Velmora');
    await t.pipeline.ingest([connect(7), room('Market Square', 8), raw('text', 9)]);
    t.parts.service.poke();
    await t.parts.service.idle();
    expect(t.parts.service.current()).toHaveLength(1);
  });
});
