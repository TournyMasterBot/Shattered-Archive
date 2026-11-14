import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pipeline } from './pipeline';
import { SessionScan } from './primer';
import { Tailer } from './tailer';

const rec = (type: string, payload: unknown, second: number): string =>
  JSON.stringify({ type, subtype: '', level: 'info', timestamp: new Date(Date.UTC(2026, 10, 14, 13, 0, second)).toISOString(), payload });
const gmcp = (data: string, second: number): string => rec('game:remote-server:gmcp', { type: 'gmcp', data }, second);

describe('SessionScan', () => {
  it('ignores a line that only mentions a marker (a player typing "login_data" is game text, not a login)', () => {
    const scan = new SessionScan();
    scan.offer(rec('game:remote-server:raw', { type: 'raw', data: 'someone says login_data room_data\r\n' }, 1));
    scan.offer('not json but login_data');
    expect(scan.done).toBe(false);
    expect(scan.lines()).toEqual([]);
  });

  it('keeps nothing from a login, room or vitals that has no connection record behind it', () => {
    const scan = new SessionScan();
    scan.offer(gmcp('login_data {"name": "Tester", "level": 3}', 1));
    expect(scan.lines()).toEqual([]);
  });

  it('is finished at the first record that settles the question, and then takes no more lines', () => {
    const scan = new SessionScan();
    const connect = rec('game:remote-server:connect', { host: 'h', port: 1 }, 5);
    scan.offer(connect);
    expect(scan.done).toBe(true);
    scan.offer(rec('game:server:connection:client-closed', {}, 1)); // older, offered after: must not replace the newest
    expect(scan.lines()).toEqual([connect]);
  });
});

describe('a Copilot switch-on in the middle of a connection (the bug: online, but no suggestions)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-prime-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('leaves the pipeline knowing it is connected, which character is in which room, and in what health', async () => {
    fs.mkdirSync(path.join(root, 'logs', '2026'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'logs', '2026', 'a.jsonl'),
      [
        rec('game:remote-server:connect', { host: 'dsl-mud.org', port: 4000 }, 1),
        gmcp('login_data {"name": "Tester", "level": 25}', 2),
        rec('game:remote-server:raw', { type: 'raw', data: 'A long hall.\r\n' }, 3),
        gmcp('room_data {"room": "Chamber of Repose", "sector": "inside", "exits": ["N", "S"]}', 4),
        gmcp('char_data {"hp": 735, "max_hp": 735, "mana": 687, "max_mana": 687, "move": 256, "max_move": 256}', 5),
      ].map((l) => `${l}\n`).join(''),
    );
    const logins: string[] = [];
    const sessions: Array<{ state: string; target?: string }> = [];
    const pipeline = new Pipeline({
      onFeed: (events) => {
        for (const event of events) {
          if (event.type === 'login') logins.push(event.name);
          if (event.type === 'session') sessions.push({ state: event.state, ...(event.target === undefined ? {} : { target: event.target }) });
        }
      },
    });
    const tailer = new Tailer({ dir: path.join(root, 'logs'), checkpointPath: path.join(root, 'cp.json'), onBatch: (b) => pipeline.ingest(b.lines) });
    tailer.setPaused(true);
    tailer.setPaused(false); // Copilot is switched on while the game is already connected
    await tailer.poll(true);

    expect(pipeline.game.connected).toBe(true);
    expect(pipeline.game.room).toEqual({ name: 'Chamber of Repose', sector: 'inside', exits: ['N', 'S'] });
    expect(pipeline.game.vitals).toMatchObject({ hp: 735, maxHp: 735 });
    expect(logins).toEqual(['Tester']);
    expect(sessions).toEqual([{ state: 'connected', target: 'dsl-mud.org:4000' }]);
    // the text that was already written is not in the ring: only the session records are
    expect(pipeline.recent().some((event) => event.type === 'lines')).toBe(false);
  });
});
