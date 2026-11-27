import { MAX_LOG_LINE_CHARS, parseLogLine, parseLogRecord } from './events';

/** A log record in the shape the game-server writes (names are placeholders). */
function record(type: string, payload: unknown, timestamp = '2026-11-05T13:07:17.140Z'): string {
  return JSON.stringify({ type, subtype: '', level: 'debug', timestamp, payload });
}
const gmcp = (data: string, ts?: string): string => record('game:remote-server:gmcp', { type: 'gmcp', data }, ts);
const AT = Date.parse('2026-11-05T13:07:17.140Z');

describe('parseLogLine: raw text', () => {
  it('reads the data of a raw record with its timestamp', () => {
    expect(parseLogLine(record('game:remote-server:raw', { type: 'raw', data: 'You see a door.\r\n' }))).toEqual({
      kind: 'raw',
      at: AT,
      data: 'You see a door.\r\n',
    });
  });

  it('skips a raw record with no payload or a non-string data field as malformed', () => {
    expect(parseLogRecord(record('game:remote-server:raw', undefined))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseLogRecord(record('game:remote-server:raw', { type: 'raw', data: 5 }))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('parseLogLine: GMCP', () => {
  it('reads room_data', () => {
    expect(parseLogLine(gmcp('room_data {"room": "Grassy plains", "sector": "hills", "exits": [ "N", "E" ]  }'))).toEqual({
      kind: 'room',
      at: AT,
      room: 'Grassy plains',
      sector: 'hills',
      exits: ['N', 'E'],
    });
  });

  it('defaults missing sector and exits, and drops non-string exits', () => {
    expect(parseLogLine(gmcp('room_data {"room": "A room"}'))).toMatchObject({ sector: '', exits: [] });
    expect(parseLogLine(gmcp('room_data {"room": "A room", "exits": ["N", 4, null]}'))).toMatchObject({ exits: ['N'] });
  });

  it('skips room_data without a room name', () => {
    expect(parseLogRecord(gmcp('room_data {"sector": "hills"}'))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseLogRecord(gmcp('room_data {"room": "  "}'))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('reads char_data vitals, the fight flag and the money fields', () => {
    const body =
      'char_data { "hp": 1471,  "max_hp": 1500,  "mana": 769,  "max_mana": 800,  "move": 406,  "max_move": 410,  "gold": 1334,  "silver": 225,  "tnl": 473558, "is_fighting": true }';
    expect(parseLogLine(gmcp(body))).toEqual({
      kind: 'char',
      at: AT,
      vitals: { hp: 1471, maxHp: 1500, mana: 769, maxMana: 800, move: 406, maxMove: 410 },
      inFight: true,
      gold: 1334,
      silver: 225,
      tnl: 473558,
    });
  });

  it('leaves the fight flag and money out when the game does not send them', () => {
    const event = parseLogLine(
      gmcp('char_data { "hp": 1, "max_hp": 2, "mana": 3, "max_mana": 4, "move": 5, "max_move": 6 }'),
    );
    expect(event).toEqual({ kind: 'char', at: AT, vitals: { hp: 1, maxHp: 2, mana: 3, maxMana: 4, move: 5, maxMove: 6 } });
  });

  it('skips char_data with a missing or non-finite vital', () => {
    expect(parseLogRecord(gmcp('char_data { "hp": 1, "max_hp": 2 }')).ok).toBe(false);
    expect(
      parseLogRecord(gmcp('char_data { "hp": "1", "max_hp": 2, "mana": 3, "max_mana": 4, "move": 5, "max_move": 6 }')).ok,
    ).toBe(false);
  });

  it('reads login_data with the (real) name and level', () => {
    expect(parseLogLine(gmcp('login_data {"name":"Agate","is_clan":false,"level":51,"time":"3:30pm"}'))).toEqual({
      kind: 'login',
      at: AT,
      name: 'Agate',
      level: 51,
    });
  });

  it('reads login_data without a level, and skips one without a name', () => {
    expect(parseLogLine(gmcp('login_data {"name":" Agate "}'))).toEqual({ kind: 'login', at: AT, name: 'Agate' });
    expect(parseLogRecord(gmcp('login_data {"level":51}'))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseLogRecord(gmcp('login_data {"name":""}'))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('reads tick, and skips a tick without a time', () => {
    expect(parseLogLine(gmcp('tick {"time": "3:30pm"  }'))).toEqual({ kind: 'tick', at: AT, time: '3:30pm' });
    expect(parseLogRecord(gmcp('tick {"x": 1}'))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('ignores GMCP packages Copilot does not use', () => {
    expect(parseLogRecord(gmcp('affect_data { "affects" : [] }'))).toEqual({ ok: false, reason: 'ignored' });
    expect(parseLogRecord(gmcp('remove_affect { "n": "x" }'))).toEqual({ ok: false, reason: 'ignored' });
  });

  it('skips a used package whose body is not JSON, is not an object, or is missing', () => {
    expect(parseLogRecord(gmcp('room_data {not json')).ok).toBe(false);
    expect(parseLogRecord(gmcp('room_data')).ok).toBe(false);
    expect(parseLogRecord(gmcp('room_data [1,2]')).ok).toBe(false);
    expect(parseLogRecord(gmcp('char_data')).ok).toBe(false);
  });

  it('reports a GMCP payload without a data string as malformed', () => {
    expect(parseLogRecord(record('game:remote-server:gmcp', { type: 'gmcp' }))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('parseLogLine: input, connect and close', () => {
  it('reads a command from the JSON-string payload', () => {
    expect(parseLogLine(record('game:client:input', '{"type":"data","data":"look"}'))).toEqual({
      kind: 'input',
      at: AT,
      data: 'look',
    });
  });

  it('also accepts the payload as an object', () => {
    expect(parseLogLine(record('game:client:input', { type: 'data', data: 'north' }))).toEqual({
      kind: 'input',
      at: AT,
      data: 'north',
    });
  });

  it('ignores control messages such as connect, and skips payloads that are not JSON or have no data', () => {
    expect(parseLogRecord(record('game:client:input', '{"type":"connect","host":"h","port":1}'))).toEqual({
      ok: false,
      reason: 'ignored',
    });
    expect(parseLogRecord(record('game:client:input', 'not json')).ok).toBe(false);
    expect(parseLogRecord(record('game:client:input', '{"type":"data"}')).ok).toBe(false);
    expect(parseLogRecord(record('game:client:input', '[1]')).ok).toBe(false);
    expect(parseLogRecord(record('game:client:input', undefined)).ok).toBe(false);
  });

  it('reads connect and close, with the close code when present', () => {
    expect(parseLogLine(record('game:remote-server:connect', { host: 'h', port: 4000 }))).toEqual({ kind: 'connect', at: AT, target: 'h:4000' });
    // a record that names no usable host and port is still a connect, with no target
    for (const payload of [undefined, { host: 'h' }, { port: 4000 }, { host: '', port: 4000 }, { host: 4, port: 4000 }, { host: 'h', port: '4000' }])
      expect(parseLogLine(record('game:remote-server:connect', payload))).toEqual({ kind: 'connect', at: AT });
    expect(parseLogLine(record('game:server:connection:client-closed', { code: 1001, reason: '' }))).toEqual({
      kind: 'closed',
      at: AT,
      code: 1001,
    });
    expect(parseLogLine(record('game:server:connection:client-closed', undefined))).toEqual({ kind: 'closed', at: AT });
  });
});

describe('parseLogLine: bad input never throws', () => {
  it('skips malformed JSON, JSON that is not an object, and records without a type', () => {
    expect(parseLogRecord('{"type": "game:remote-server:raw", ')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseLogRecord('[1,2,3]')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseLogRecord('42')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseLogRecord('{"timestamp":"2026-11-05T13:07:17.140Z"}')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseLogRecord('')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('skips a record whose timestamp is missing or not a date', () => {
    const base = { type: 'game:remote-server:raw', payload: { type: 'raw', data: 'x' } };
    expect(parseLogRecord(JSON.stringify(base)).ok).toBe(false);
    expect(parseLogRecord(JSON.stringify({ ...base, timestamp: 'not a date' })).ok).toBe(false);
    expect(parseLogRecord(JSON.stringify({ ...base, timestamp: 12345 })).ok).toBe(false);
  });

  it('ignores server start-up records and other types without calling them malformed', () => {
    expect(parseLogRecord(record('[game-server] Listening on port', { port: 31000 }))).toEqual({
      ok: false,
      reason: 'ignored',
    });
  });

  it('rejects a 5 MB line as oversize without parsing it (a count, not a crash)', () => {
    const huge = record('game:remote-server:raw', { type: 'raw', data: 'x'.repeat(5 * 1024 * 1024) });
    expect(huge.length).toBeGreaterThan(MAX_LOG_LINE_CHARS);
    expect(parseLogRecord(huge)).toEqual({ ok: false, reason: 'oversize' });
    expect(parseLogLine(huge)).toBeNull();
  });

  it('accepts a line just under the cap', () => {
    const data = 'x'.repeat(MAX_LOG_LINE_CHARS - 200);
    const line = record('game:remote-server:raw', { type: 'raw', data });
    expect(line.length).toBeLessThanOrEqual(MAX_LOG_LINE_CHARS);
    expect(parseLogLine(line)).toMatchObject({ kind: 'raw' });
  });
});
