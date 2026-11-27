import { Pipeline } from '../tail/pipeline';
import type { TailStats } from '../tail/tailer';
import { buildStateView } from './state';

const T0 = Date.UTC(2026, 10, 5, 13, 0, 0);
const rec = (type: string, payload: unknown, s: number): string =>
  JSON.stringify({ type, subtype: '', level: 'debug', timestamp: new Date(T0 + s * 1000).toISOString(), payload });
const tail: TailStats = { scans: 3, files: 2, lines: 9, bytes: 400, resets: 1, renames: 0, oversize: 0, ioErrors: 0, consumerErrors: 0, lastScanAt: 5 };

describe('buildStateView', () => {
  it('reports the room title, vitals and freshness, and flips to stale when the text stops (T2)', async () => {
    const p = new Pipeline();
    await p.ingest([
      rec('game:remote-server:gmcp', { type: 'gmcp', data: 'room_data {"room": "Market Square", "sector": "city", "exits": ["N"]}' }, 1),
      rec('game:remote-server:gmcp', { type: 'gmcp', data: 'char_data { "hp": 90, "max_hp": 100, "mana": 5, "max_mana": 10, "move": 6, "max_move": 12 }' }, 1),
      rec('game:remote-server:raw', { type: 'raw', data: 'A line of text.\r\n' }, 2),
    ]);

    const fresh = buildStateView(p.game, T0 + 12_000, 60_000, p.counters, tail);
    expect(fresh).toMatchObject({
      connected: false,
      stale: false,
      staleAfterSeconds: 60,
      lastEventAgeSeconds: 10,
      lastTextAgeSeconds: 10,
      inFight: false,
      room: { name: 'Market Square', sector: 'city', exits: ['N'] },
      vitals: { hp: 90, maxHp: 100 },
      tail: { files: 2, lines: 9, resets: 1 },
    });

    const quiet = buildStateView(p.game, T0 + 2_000 + 61_000, 60_000, p.counters, tail);
    expect(quiet.stale).toBe(true);
    expect(quiet.lastEventAgeSeconds).toBe(61);
    expect(quiet.lastTextAgeSeconds).toBe(61);
  });

  it('measures the text age on the text feed, not on GMCP (GMCP alone does not keep the feed alive)', async () => {
    const p = new Pipeline();
    await p.ingest([
      rec('game:remote-server:raw', { type: 'raw', data: 'A line of text.\r\n' }, 1),
      rec('game:remote-server:gmcp', { type: 'gmcp', data: 'room_data {"room": "Market Square", "sector": "city", "exits": ["N"]}' }, 30),
    ]);
    const view = buildStateView(p.game, T0 + 40_000, 60_000, p.counters, tail);
    expect(view.lastEventAgeSeconds).toBe(10);
    expect(view.lastTextAgeSeconds).toBe(39);
  });

  it('before any event it is stale, with no room, no vitals and no age', async () => {
    const view = buildStateView(new Pipeline().game, T0, 60_000, new Pipeline().counters, tail);
    expect(view).toMatchObject({ stale: true, lastEventAgeSeconds: null, lastTextAgeSeconds: null, room: null, vitals: null });
  });

  it('never contains game text, command text or a character name', async () => {
    const p = new Pipeline();
    await p.ingest([
      rec('game:remote-server:gmcp', { type: 'gmcp', data: 'login_data {"name": "Zzyzx", "level": 51}' }, 1),
      rec('game:remote-server:raw', { type: 'raw', data: 'SECRET-RAW-TEXT tells you something private.\r\n' }, 2),
      rec('game:client:input', JSON.stringify({ type: 'data', data: 'tell friend SECRET-COMMAND\r\n' }), 3),
      rec('game:remote-server:gmcp', { type: 'gmcp', data: 'room_data {"room": "Hall", "sector": "inside", "exits": []}' }, 4),
    ]);
    expect(p.recent().some((e) => e.type === 'command')).toBe(true); // the text IS in the feed ...
    const body = JSON.stringify(buildStateView(p.game, T0 + 5_000, 60_000, p.counters, tail));
    expect(body).toContain('Hall'); // ... but not in the response
    for (const secret of ['SECRET-RAW-TEXT', 'SECRET-COMMAND', 'Zzyzx', 'payload']) expect(body).not.toContain(secret);
  });

  it('copies the arrays and objects, so a caller cannot change the live state through the response', async () => {
    const p = new Pipeline();
    await p.ingest([rec('game:remote-server:gmcp', { type: 'gmcp', data: 'room_data {"room": "Hall", "sector": "inside", "exits": ["N"]}' }, 1)]);
    const view = buildStateView(p.game, T0 + 2_000, 60_000, p.counters, tail);
    view.room?.exits.push('S');
    expect(p.game.room?.exits).toEqual(['N']);
  });
});

describe('buildStateView: learning', () => {
  it('says whether the server is reading the logs, and is off when nobody said otherwise', async () => {
    const p = new Pipeline();
    expect(buildStateView(p.game, T0, 60_000, p.counters, tail).learning).toBe(false);
    expect(buildStateView(p.game, T0, 60_000, p.counters, tail, true).learning).toBe(true);
  });
});
