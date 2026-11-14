import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isStale, type FeedEvent } from '@shatteredarchive/copilot-core';
import { Pipeline } from './pipeline';
import { Tailer } from './tailer';

function record(type: string, payload: unknown, timestamp: string): string {
  return JSON.stringify({ type, subtype: '', level: 'debug', timestamp, payload });
}
const at = (s: number): string => new Date(Date.UTC(2026, 10, 5, 13, 0, s)).toISOString();
const ms = (s: number): number => Date.UTC(2026, 10, 5, 13, 0, s);
const raw = (data: string, s: number): string => record('game:remote-server:raw', { type: 'raw', data }, at(s));
const gmcp = (data: string, s: number): string => record('game:remote-server:gmcp', { type: 'gmcp', data }, at(s));
const room = (name: string, s: number): string => gmcp(`room_data {"room": "${name}", "sector": "city", "exits": ["N","E"]}`, s);
const vitals = (hp: number, s: number, fight = false): string =>
  gmcp(`char_data { "hp": ${hp}, "max_hp": 100, "mana": 5, "max_mana": 10, "move": 6, "max_move": 12, "is_fighting": ${fight} }`, s);

describe('Pipeline', () => {
  it('turns log lines into game state and a compact feed', async () => {
    const fed: FeedEvent[][] = [];
    const p = new Pipeline({ onFeed: (e) => void fed.push(e) });
    await p.ingest([room('Market Square', 1), vitals(90, 2), raw('You are standing in a square.\r\n', 3), record('game:client:input', JSON.stringify({ type: 'data', data: 'look\r\n' }), at(4))]);

    expect(p.game.room).toEqual({ name: 'Market Square', sector: 'city', exits: ['N', 'E'] });
    expect(p.game.vitals).toMatchObject({ hp: 90, maxHp: 100 });
    expect(p.game.lastTextAt).toBeGreaterThan(0);
    expect(fed).toHaveLength(1);
    expect(fed[0].map((e) => e.type)).toEqual(['room', 'vitals', 'lines', 'command']);
    expect(fed[0][3]).toEqual({ type: 'command', at: ms(4), command: 'look' });
    expect(p.counters).toMatchObject({ lines: 4, malformed: 0 });
  });

  it('carries the unfinished last text line from one batch to the next', async () => {
    const p = new Pipeline();
    await p.ingest([raw('A half li', 1)]);
    expect(p.recent()).toEqual([]);
    await p.ingest([raw('ne.\r\nNext', 2)]);
    expect(p.recent()).toEqual([{ type: 'lines', at: ms(2), lines: ['A half line.'] }]);
  });

  it('counts what it cannot use instead of failing', async () => {
    const p = new Pipeline();
    await p.ingest(['{broken', record('game:remote-server:gmcp', { type: 'gmcp', data: 'room.info {"x":1}' }, at(1)), 'x'.repeat(1_000_001), room('A', 2)]);
    expect(p.counters).toMatchObject({ lines: 4, events: 1, malformed: 1, ignored: 1, oversize: 1 });
    expect(p.game.room?.name).toBe('A');
  });

  it('an empty or all-unusable batch changes nothing and calls nobody', async () => {
    const onFeed = jest.fn();
    const p = new Pipeline({ onFeed });
    await p.ingest([]);
    await p.ingest(['nope']);
    await p.ingest([vitals(50, 1)]);
    await p.ingest([vitals(50, 2)]); // the same vitals again: collapsed, no feed event
    expect(onFeed).toHaveBeenCalledTimes(1);
  });

  it('hands the real login name to onFeed once and keeps it out of the ring', async () => {
    const fed: FeedEvent[] = [];
    const p = new Pipeline({ onFeed: (e) => void fed.push(...e) });
    await p.ingest([gmcp('login_data {"name": "Zzyzx", "level": 51}', 1)]);
    expect(fed).toEqual([{ type: 'login', at: ms(1), name: 'Zzyzx', level: 51 }]);
    expect(JSON.stringify(p.recent())).not.toContain('Zzyzx');
    expect(p.recent()).toEqual([{ type: 'login', at: ms(1), level: 51 }]);

    await p.ingest([gmcp('login_data {"name": "Qwerty"}', 2)]);
    expect(p.recent()[1]).toEqual({ type: 'login', at: ms(2) });
    expect(JSON.stringify(p.recent())).not.toContain('Qwerty');
  });

  it('returns the last N events with recent(n)', async () => {
    const p = new Pipeline();
    for (let i = 0; i < 5; i++) await p.ingest([room(`Room ${i}`, i + 1)]);
    expect(p.recent(2).map((e) => (e.type === 'room' ? e.room : ''))).toEqual(['Room 3', 'Room 4']);
    expect(p.recent(0)).toEqual([]);
    expect(p.recent(-3)).toEqual([]);
    expect(p.recent()).toHaveLength(5);
  });

  it('bounds the ring by event count', async () => {
    const p = new Pipeline({ ringMaxEvents: 3 });
    for (let i = 0; i < 10; i++) await p.ingest([room(`Room ${i}`, i + 1)]);
    expect(p.ringSize.events).toBe(3);
    expect(p.recent().map((e) => (e.type === 'room' ? e.room : ''))).toEqual(['Room 7', 'Room 8', 'Room 9']);
  });

  it('bounds the ring by size, always keeping the newest event, and keeps only the last lines of a huge batch', async () => {
    const p = new Pipeline({ ringMaxChars: 5_000 });
    const text = (n: number): string => `${Array.from({ length: n }, (_, i) => `row ${i} ${'x'.repeat(50)}`).join('\r\n')}\r\n`;
    for (let i = 0; i < 20; i++) await p.ingest([raw(text(20), i + 1), room(`R${i}`, i + 1)]);
    expect(p.ringSize.chars).toBeLessThanOrEqual(5_000 + 4_000); // the newest may overshoot, nothing older does
    expect(p.recent().length).toBeLessThan(20);

    const big = new Pipeline();
    await big.ingest([raw(text(2_000), 1), room('end', 2)]);
    const lines = big.recent().find((e) => e.type === 'lines');
    expect(lines && lines.type === 'lines' ? lines.lines.length : 0).toBe(500);
    expect(lines && lines.type === 'lines' ? lines.lines[499] : '').toContain('row 1999');
  });

  it('goes stale when the text stops while GMCP keeps coming (T2)', async () => {
    const p = new Pipeline();
    await p.ingest([raw('text\r\n', 1), vitals(10, 1)]);
    const limit = 60_000;
    expect(isStale(p.game, ms(1) + 59_000, limit)).toBe(false);
    await p.ingest([vitals(11, 100)]); // GMCP alone proves nothing about the text feed
    expect(isStale(p.game, ms(100), limit)).toBe(true);
    await p.ingest([raw('more\r\n', 101)]);
    expect(isStale(p.game, ms(101), limit)).toBe(false);
  });
});

describe('Tailer + Pipeline over a folder that holds both the jsonl and its text twin (E16)', () => {
  let dir: string;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-pipe-'))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('produces events from the jsonl only and no malformed line from the twin', async () => {
    const logs = path.join(dir, 'logs', '2026', '11', '05');
    fs.mkdirSync(logs, { recursive: true });
    const pipeline = new Pipeline();
    const tailer = new Tailer({ dir: path.join(dir, 'logs'), checkpointPath: path.join(dir, 'cp.json'), onBatch: (b) => pipeline.ingest(b.lines) });
    await tailer.poll(true);

    fs.writeFileSync(path.join(logs, 'server.log-2026-11-06.jsonl'), `${room('Market Square', 1)}\n${raw('hello\r\n', 2)}\n`);
    fs.writeFileSync(path.join(logs, 'server-2026-11-06.log'), '[2026-11-06 00:00:01] plain text twin, not json\n[2026-11-06 00:00:02] another\n');
    await tailer.poll(true);
    expect(pipeline.counters).toMatchObject({ lines: 2, events: 2, malformed: 0 });
    expect(pipeline.game.room?.name).toBe('Market Square');
  });
});
