import { DSL_PACKAGE_NAMES } from './dslGmcpSchema';
import { buildParityReport, checkMessage, type CheckedEntry, type Finding } from './gmcpParity';

// A message exactly as DSL sends it, per package. Names and text are placeholders.
const CHAR_DATA = {
  hp: 100, max_hp: 100, mana: 50, max_mana: 50, move: 80, max_move: 80, gold: 3, silver: 4, wimpy: 0,
  str: 15, max_str: 15, int: 14, max_int: 14, wis: 13, max_wis: 13, dex: 12, max_dex: 12, con: 11, max_con: 11,
  stance: 'Defensive', language: 'Common', tnl: 500, carry_weight: 10, can_carry_weight: 200,
  is_afk: false, is_quiet: false, is_flying: false, is_riding: false, is_fighting: false,
};
const GOOD: Record<string, unknown> = {
  login_data: { name: '<character>', is_clan: false, is_kingdom: false, level: 51, time: '3:30pm' },
  char_data: CHAR_DATA,
  room_data: { room: '<room>', sector: 'city', exits: ['N', 'S'] },
  tick: { time: '9:00pm' },
  add_affect: { n: 'bless', d: 12, m: 1, lc: 'hit roll', t: 0 },
  remove_affect: { n: 'bless' },
  affect_data: { affects: [{ n: 'bless', d: 12, m: 1, lc: 'hit roll', t: 0 }] },
};

const codes = (findings: Finding[]): string[] => findings.map((f) => `${f.severity}:${f.code}:${f.path}`);

describe('checkMessage: a message DSL would send', () => {
  it.each(DSL_PACKAGE_NAMES)('%s has no findings', (pkg) => {
    expect(checkMessage(pkg, GOOD[pkg])).toEqual([]);
  });

  it('accepts the optional fields when present: clan, kingdom, chamber', () => {
    expect(checkMessage('login_data', { ...(GOOD.login_data as object), is_clan: true, clan: 'x', is_kingdom: true, kingdom: 'y' })).toEqual([]);
    expect(checkMessage('char_data', { ...CHAR_DATA, chamber: 100 })).toEqual([]);
  });

  it('accepts an empty affect list and empty exits', () => {
    expect(checkMessage('affect_data', { affects: [] })).toEqual([]);
    expect(checkMessage('room_data', { ...(GOOD.room_data as object), exits: [] })).toEqual([]);
  });

  it('accepts DSL lowercase "common" and the three stance words', () => {
    expect(checkMessage('char_data', { ...CHAR_DATA, language: 'common', stance: 'neutral' })).toEqual([]);
    expect(checkMessage('char_data', { ...CHAR_DATA, stance: 'Offensive' })).toEqual([]);
  });
});

describe('checkMessage: differences', () => {
  it('flags an unknown package as a warning', () => {
    expect(codes(checkMessage('comm_channel', { a: 1 }))).toEqual(['warn:unknown-package:']);
  });

  it('flags a payload that is not a JSON object', () => {
    for (const bad of [null, 5, 'text', [1, 2]]) {
      expect(codes(checkMessage('tick', bad))).toEqual(['error:not-an-object:']);
    }
  });

  it('flags a missing field as an error, naming it', () => {
    const { hp: _hp, ...rest } = CHAR_DATA;
    void _hp;
    expect(codes(checkMessage('char_data', rest))).toEqual(['error:missing-field:hp']);
  });

  it('flags every wrong type with what was expected and what came', () => {
    const findings = checkMessage('char_data', { ...CHAR_DATA, hp: '100', is_afk: 0, stance: null });
    expect(findings.map((f) => `${f.path}: ${f.message}`).sort()).toEqual([
      'hp: expected number, got string',
      'is_afk: expected boolean, got number',
      'stance: expected string, got null',
    ]);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });

  it('flags a wrong type inside the exits array and a non-array exits', () => {
    expect(codes(checkMessage('room_data', { ...(GOOD.room_data as object), exits: ['N', 5] }))).toEqual(['error:wrong-type:exits[]']);
    expect(codes(checkMessage('room_data', { ...(GOOD.room_data as object), exits: 'N' }))).toEqual(['error:wrong-type:exits']);
  });

  it('flags a value outside a strict set as a warning and includes the value', () => {
    const [finding] = checkMessage('room_data', { ...(GOOD.room_data as object), sector: 'water swim' });
    expect(finding).toMatchObject({ severity: 'warn', code: 'value-outside-set', path: 'sector', value: 'water swim' });
    expect(codes(checkMessage('room_data', { ...(GOOD.room_data as object), exits: ['N', 'X'] }))).toEqual(['warn:value-outside-set:exits[]']);
    expect(codes(checkMessage('char_data', { ...CHAR_DATA, stance: 'berserk' }))).toEqual(['warn:value-outside-set:stance']);
  });

  it('notes the language words the owner chose to keep, as information', () => {
    const findings = checkMessage('char_data', { ...CHAR_DATA, language: 'elven' });
    expect(findings).toEqual([{ severity: 'info', code: 'known-difference', path: 'language', message: 'differs from DSL by decision', value: 'elven' }]);
    expect(codes(checkMessage('char_data', { ...CHAR_DATA, language: 'klingon' }))).toEqual(['warn:value-outside-set:language']);
  });

  it('only notes an affect location DSL has not been seen to send', () => {
    expect(codes(checkMessage('add_affect', { ...(GOOD.add_affect as object), lc: 'experience' }))).toEqual(['info:value-not-seen:lc']);
  });

  it('flags a game clock outside the H:00 / H:30 form', () => {
    for (const time of ['9:15pm', '21:00', '9:00', '0:00am', '13:00pm']) {
      expect(codes(checkMessage('tick', { time }))).toEqual(['warn:bad-pattern:time']);
    }
    expect(checkMessage('login_data', { ...(GOOD.login_data as object), time: 'Sun Dec 21 2025 20:40:32' })[0]).toMatchObject({ code: 'bad-pattern', path: 'time' });
  });

  it('notes an extra field DSL does not send', () => {
    expect(codes(checkMessage('tick', { time: '9:00pm', trust: 60 }))).toEqual(['info:extra-field:trust']);
  });

  it('checks each element of the affect list, naming the field inside it', () => {
    const findings = checkMessage('affect_data', { affects: [{ n: 'a', d: 1, m: 1, lc: 'hp', t: 0 }, { n: 'b', d: '2', m: 1, lc: 'hp', t: 0 }, 'x'] });
    expect(codes(findings)).toEqual(['error:wrong-type:affects[].d', 'error:wrong-type:affects[]']);
  });

  it('flags a missing or non-array affects field', () => {
    expect(codes(checkMessage('affect_data', {}))).toEqual(['error:missing-field:affects']);
    expect(codes(checkMessage('affect_data', { affects: 'none' }))).toEqual(['error:wrong-type:affects']);
  });

  it('does not repeat free text in a finding: only enum-like fields carry a value', () => {
    const findings = checkMessage('login_data', { name: 5, is_clan: false, is_kingdom: false, level: 1, time: '3:30pm', extra: 'secret-text' });
    expect(JSON.stringify(findings)).not.toContain('secret-text');
    expect(findings.every((f) => f.value === undefined)).toBe(true);
  });
});

describe('buildParityReport', () => {
  const entry = (pkg: string, data?: unknown, parseError?: string): CheckedEntry => ({ pkg, data, ...(parseError ? { parseError } : {}) });

  it('lists every DSL package in DSL order, as not seen when nothing arrived', () => {
    const report = buildParityReport([]);
    expect(report.packages.map((p) => p.name)).toEqual(DSL_PACKAGE_NAMES);
    expect(report.packages.every((p) => p.status === 'not-seen' && p.seen === 0 && p.findings.length === 0)).toBe(true);
    expect(report).toMatchObject({ unknownPackages: [], unparsable: 0, checked: 0 });
  });

  it('marks a package that always matches as match, with its count', () => {
    const report = buildParityReport([entry('tick', GOOD.tick), entry('tick', { time: '9:30pm' })]);
    expect(report.packages.find((p) => p.name === 'tick')).toMatchObject({ seen: 2, status: 'match', findings: [] });
  });

  it('aggregates the same difference across messages into one finding with a count', () => {
    const bad = { ...(GOOD.room_data as object), sector: 'water swim' };
    const report = buildParityReport([entry('room_data', bad), entry('room_data', bad), entry('room_data', GOOD.room_data)]);
    const room = report.packages.find((p) => p.name === 'room_data');
    expect(room).toMatchObject({ seen: 3, status: 'differs' });
    expect(room?.findings).toHaveLength(1);
    expect(room?.findings[0]).toMatchObject({ code: 'value-outside-set', value: 'water swim', count: 2 });
  });

  it('keeps different values of the same field as separate findings', () => {
    const a = { ...(GOOD.room_data as object), sector: 'water swim' };
    const b = { ...(GOOD.room_data as object), sector: 'water noswim' };
    const room = buildParityReport([entry('room_data', a), entry('room_data', b)]).packages.find((p) => p.name === 'room_data');
    expect(room?.findings.map((f) => f.value).sort()).toEqual(['water noswim', 'water swim']);
  });

  it('is "noted" when only information differs, and "differs" as soon as a warning or error exists', () => {
    const noted = buildParityReport([entry('char_data', { ...CHAR_DATA, language: 'elven' })]).packages.find((p) => p.name === 'char_data');
    expect(noted?.status).toBe('noted');
    const differs = buildParityReport([entry('char_data', { ...CHAR_DATA, language: 'elven', stance: 'berserk' })]).packages.find((p) => p.name === 'char_data');
    expect(differs?.status).toBe('differs');
  });

  it('orders findings errors first, then warnings, then information, then by count', () => {
    const report = buildParityReport([entry('char_data', { ...CHAR_DATA, language: 'elven', stance: 'berserk', hp: 'x', zzz: 1 })]);
    const severities = report.packages.find((p) => p.name === 'char_data')?.findings.map((f) => f.severity);
    expect(severities).toEqual(['error', 'warn', 'info', 'info']);
  });

  it('counts unknown packages apart and keeps them out of the DSL rows', () => {
    const report = buildParityReport([entry('chat', {}), entry('chat', {}), entry('weather', {})]);
    expect(report.unknownPackages).toEqual([{ name: 'chat', seen: 2 }, { name: 'weather', seen: 1 }]);
    expect(report.packages.every((p) => p.seen === 0)).toBe(true);
    expect(report.checked).toBe(3);
  });

  it('counts a DSL package that could not be parsed as seen but unparsable, with no findings', () => {
    const report = buildParityReport([entry('tick', undefined, 'invalid JSON'), entry('char_data')]);
    expect(report.unparsable).toBe(2);
    expect(report.packages.find((p) => p.name === 'tick')).toMatchObject({ seen: 1, status: 'match', findings: [] });
  });
});
