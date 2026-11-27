import { CONSTELLATIONS, loadMatrix, parseWhoisic, validateSuggestion, type TestMatrix } from '@shatteredarchive/copilot-core';
import path from 'node:path';
import { MemoryFs } from '../testing/memoryFs';
import { whoisicBlock } from '../testing/whoisicFixtures';
import { CharacterService, NAME_SHAPE } from './service';

// All names here are invented placeholders.
const MATRIX: TestMatrix = loadMatrix([
  { codename: 'Agate', male: 'Zorvak', female: 'Quenta' },
  { codename: 'C002', male: 'Tamsin' },
]).matrix;
const DIR = '/data/characters';

let fs: MemoryFs;
let clock: number;

beforeEach(() => {
  fs = new MemoryFs();
  clock = 1_000;
});

/** `null` means no matrix (an explicit undefined would take the default). */
async function open(matrix: TestMatrix | null = MATRIX): Promise<CharacterService> {
  const { service } = await CharacterService.open({ fs, dir: DIR, matrix: matrix ?? undefined, now: () => clock });
  return service;
}

/** A parsed block, as the watcher would deliver it. */
function block(name: string, at: number, options: Parameters<typeof whoisicBlock>[1] = {}) {
  const record = parseWhoisic(whoisicBlock(name, options), at);
  if (record === null) throw new Error('fixture did not parse');
  return record;
}

/** The content of a registry file; found by name whatever the path separator of the platform. */
const file = (name: string): string =>
  [...fs.files]
    .filter(([p]) => p.split(path.sep).join('/').endsWith(`/${name}`))
    .map(([, content]) => content)
    .join('');
const seed = (name: string, content: string): void => void fs.files.set(path.join(DIR, name), content);
const REAL_NAMES = ['velmora', 'thandric', 'zorvak', 'quenta', 'tamsin'];

describe('onLogin', () => {
  it('gives a matrix name its test codename and gender and stores no name for it (E8)', async () => {
    const s = await open();
    expect(await s.onLogin('Zorvak')).toEqual({ ok: true, codename: 'Agate', kind: 'test', gender: 'M', isNew: false });
    expect(await s.onLogin('QUENTA')).toEqual({ ok: true, codename: 'Agate', kind: 'test', gender: 'F', isNew: false });
    expect(file('names.jsonl')).toBe('');
    expect(s.list().map((c) => c.codename).sort()).toEqual(['Agate-F', 'Agate-M']);
  });

  it('registers an unknown name under the next constellation, and the same name keeps its codename on the second login (E8)', async () => {
    const s = await open();
    expect(await s.onLogin('Velmora')).toEqual({ ok: true, codename: CONSTELLATIONS[0], kind: 'real', gender: 'U', isNew: true });
    clock += 50;
    expect(await s.onLogin('  velmora ')).toMatchObject({ ok: true, codename: CONSTELLATIONS[0], isNew: false });
    expect(s.counters).toMatchObject({ logins: 2, newRealCharacters: 1, refusedLogins: 0 });
    expect(s.list()).toEqual([{ codename: `${CONSTELLATIONS[0]}-U`, kind: 'real', gender: 'U', hasDescription: false }]);
  });

  it('never gives two characters one codename, even when they log in at the same moment', async () => {
    const s = await open();
    const [a, b] = await Promise.all([s.onLogin('Velmora'), s.onLogin('Thandric')]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.codename).not.toBe(b.codename);
    expect(s.list()).toHaveLength(2);
  });

  it('remembers its characters across a restart and keeps counting up, never reusing a codename', async () => {
    const first = await open();
    await first.onLogin('Velmora');
    const second = await open();
    expect(second.list()).toHaveLength(1);
    expect(await second.onLogin('Velmora')).toMatchObject({ codename: CONSTELLATIONS[0], isNew: false });
    expect(await second.onLogin('Thandric')).toMatchObject({ codename: CONSTELLATIONS[1], isNew: true });
  });

  it('a persistence failure leaves the registry unchanged and a retry gets the same codename', async () => {
    const s = await open();
    fs.failPathEnding = 'names.jsonl';
    expect(await s.onLogin('Velmora')).toEqual({ ok: false, reason: 'store-failed' });
    expect(s.list()).toEqual([]);
    expect(s.current).toBeUndefined();
    expect(file('names.jsonl')).toBe('');
    expect(s.counters).toMatchObject({ refusedLogins: 1, storeFailures: 1 });

    fs.failPathEnding = undefined;
    expect(await s.onLogin('Velmora')).toMatchObject({ ok: true, codename: CONSTELLATIONS[0], isNew: true });
  });

  it('a failed index write does not lose the character: it is repaired at the next start', async () => {
    const s = await open();
    fs.failPathEnding = 'index.jsonl';
    expect(await s.onLogin('Velmora')).toMatchObject({ ok: true });
    expect(s.counters.storeFailures).toBe(1);
    expect(s.list()).toEqual([]);

    fs.failPathEnding = undefined;
    const again = await open();
    expect(again.list().map((c) => c.codename)).toEqual([`${CONSTELLATIONS[0]}-U`]);
  });

  it.each(['', ' ', 'a', 'x'.repeat(31), 'Bob\nSmith', '12ab', 'Bob Smith', 'Bob;rm', '<name>'])('does not register %j', async (name) => {
    const s = await open();
    expect(await s.onLogin(name)).toEqual({ ok: false, reason: 'bad-name' });
    expect(file('names.jsonl')).toBe('');
    expect(s.counters.refusedLogins).toBe(1);
  });

  it('registers nobody when the test matrix is not available (fail closed)', async () => {
    const s = await open(null);
    expect(await s.onLogin('Zorvak')).toEqual({ ok: false, reason: 'unavailable' });
    expect(s.list()).toEqual([]);
    expect(file('names.jsonl')).toBe('');
    expect(file('index.jsonl')).toBe('');
  });

  it('refuses, and says why, when every codename is taken', async () => {
    const taken = CONSTELLATIONS.map((codename, i) => {
      const id = `n${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`;
      return `${JSON.stringify({ v: 1, r: { id, codename, kind: 'real', gender: 'U', firstSeen: 1, lastSeen: 1 } })}\n`;
    }).join('');
    seed('names.jsonl', taken);
    const s = await open();
    expect(await s.onLogin('Velmora')).toEqual({ ok: false, reason: 'codenames-exhausted' });
    expect(s.counters.storeFailures).toBe(0);
  });

  it('NAME_SHAPE is the name shape the matrix uses', () => {
    expect(NAME_SHAPE.test("D'Arcy-Lee")).toBe(true);
    expect(NAME_SHAPE.test('X')).toBe(false);
  });

  it('onSessionClosed forgets the active character', async () => {
    const s = await open();
    await s.onLogin('Velmora');
    expect(s.current).toEqual({ codename: CONSTELLATIONS[0], kind: 'real', gender: 'U' });
    s.onSessionClosed();
    expect(s.current).toBeUndefined();
  });
});

describe('onWhoisic', () => {
  it('stores the description of a test character under its codename and returns both colour forms', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    expect(await s.onWhoisic(block('Zorvak', 5_000))).toBe('stored');
    const view = s.getDescription('Agate-M');
    expect(view).toMatchObject({ codename: 'Agate-M', kind: 'test', gender: 'M', at: 5_000, hasDescription: true, fields: { Eyes: 'green', Sex: 'Male' } });
    expect(view?.rawAnsi).toContain('\x1b[1;31mred');
    expect(view?.dsl).toContain('{Rred');
    expect(view?.text).toBe('The first line of the description.\nThe red second line.');
    expect(s.list()[0].hasDescription).toBe(true);
  });

  it('works for a test character that has not logged in yet (the matrix is the record)', async () => {
    const s = await open();
    expect(await s.onWhoisic(block('Tamsin', 5_000))).toBe('stored');
    expect(s.getDescription('C002-M')).toBeUndefined(); // not in the index until it plays
  });

  it('a later block replaces an earlier one; an earlier block does not replace a later one', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    await s.onWhoisic(block('Zorvak', 5_000, { description: ['first version'] }));
    expect(await s.onWhoisic(block('Zorvak', 9_000, { description: ['second version'] }))).toBe('stored');
    expect(s.getDescription('Agate-M')?.text).toBe('second version');

    expect(await s.onWhoisic(block('Zorvak', 7_000, { description: ['stale version'] }))).toBe('older');
    expect(s.getDescription('Agate-M')?.text).toBe('second version');
    expect(s.getDescription('Agate-M')?.at).toBe(9_000);
  });

  it('a block with the same time counts as read later and wins; an identical block changes nothing', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    await s.onWhoisic(block('Zorvak', 5_000, { description: ['one'] }));
    expect(await s.onWhoisic(block('Zorvak', 5_000, { description: ['two'] }))).toBe('stored');
    const before = file('descriptions.jsonl');
    expect(await s.onWhoisic(block('Zorvak', 6_000, { description: ['two'] }))).toBe('unchanged');
    expect(file('descriptions.jsonl')).toBe(before);
    expect(s.counters).toMatchObject({ descriptionsStored: 2, descriptionsIgnored: 1 });
  });

  it('a block without a time is stored with the current time, and loses to one that has a time', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    const noTime = { ...block('Zorvak', 0, { description: ['untimed'] }) };
    delete noTime.at;
    expect(await s.onWhoisic(noTime)).toBe('stored');
    expect(s.getDescription('Agate-M')?.at).toBe(clock);
    expect(await s.onWhoisic({ ...noTime, text: 'again', rawAnsi: 'again' })).toBe('older');
  });

  it('keeps a character with no description as a record with hasDescription false (E7), and then stops suggesting whoisic', async () => {
    const s = await open();
    await s.onLogin('Velmora');
    expect(s.descriptionSuggestion(true)).toBeDefined();
    expect(await s.onWhoisic(block('Velmora', 5_000, { description: [] }))).toBe('stored');
    expect(s.getDescription(`${CONSTELLATIONS[0]}-M`)).toMatchObject({ hasDescription: false, rawAnsi: '', dsl: '', text: '', fields: { Profession: 'Scribe' } });
    expect(s.list()[0].hasDescription).toBe(false);
    expect(s.descriptionSuggestion(true)).toBeUndefined();
  });

  it('ignores a block for a name that is not registered (another player)', async () => {
    const s = await open();
    await s.onLogin('Velmora');
    expect(await s.onWhoisic(block('Stranger', 5_000))).toBe('unregistered');
    expect(file('descriptions.jsonl')).toBe('');
    expect(s.counters.descriptionsIgnored).toBe(1);
  });

  it('with no matrix, a registered real character still gets its description', async () => {
    const withMatrix = await open();
    await withMatrix.onLogin('Velmora');
    const s = await open(null);
    expect(await s.onWhoisic(block('Velmora', 5_000))).toBe('stored');
    expect(await s.onWhoisic(block('Zorvak', 5_000))).toBe('unregistered');
    expect(s.getDescription(`${CONSTELLATIONS[0]}-U`)?.text).toContain('first line');
  });

  it('learns the gender of a real character from Sex, once, and updates the list and the active character', async () => {
    const s = await open();
    await s.onLogin('Velmora');
    await s.onWhoisic(block('Velmora', 5_000, { sex: 'Female' }));
    expect(s.current?.gender).toBe('F');
    expect(s.list().map((c) => c.codename)).toEqual([`${CONSTELLATIONS[0]}-F`]);
    expect(s.getDescription(`${CONSTELLATIONS[0]}-U`)?.codename).toBe(`${CONSTELLATIONS[0]}-F`); // found by base, whatever suffix the client holds

    const indexBefore = file('index.jsonl');
    await s.onWhoisic(block('Velmora', 6_000, { sex: 'Female', description: ['changed'] })); // same gender again: no index change
    expect(file('index.jsonl')).toBe(indexBefore);

    const after = await open(); // survives a restart
    expect(after.list().map((c) => c.codename)).toEqual([`${CONSTELLATIONS[0]}-F`]);
    expect(await after.onLogin('Velmora')).toMatchObject({ gender: 'F', isNew: false });
  });

  it('keeps gender U for a Sex it does not understand, and for a block with no Sex', async () => {
    const s = await open();
    await s.onLogin('Velmora');
    await s.onWhoisic(block('Velmora', 5_000, { sex: 'Unspecified' }));
    expect(s.list()[0].gender).toBe('U');
    const noSex = block('Velmora', 6_000, { description: ['x'] });
    delete noSex.fields.Sex;
    await s.onWhoisic(noSex);
    expect(s.list()[0].gender).toBe('U');
  });

  it('does not change the gender of a test character (the matrix decides)', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    await s.onWhoisic(block('Zorvak', 5_000, { sex: 'Female' }));
    expect(s.list().map((c) => c.codename)).toEqual(['Agate-M']);
  });

  it('a description that cannot be saved is reported and not remembered', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    fs.failPathEnding = 'descriptions.jsonl';
    expect(await s.onWhoisic(block('Zorvak', 5_000))).toBe('failed');
    expect(s.getDescription('Agate-M')).toBeUndefined();
    expect(s.counters.storeFailures).toBe(1);
    fs.failPathEnding = undefined;
    expect(await s.onWhoisic(block('Zorvak', 5_000))).toBe('stored');
  });

  it('a gender that cannot be saved is counted and the description is still kept', async () => {
    const s = await open();
    await s.onLogin('Velmora');
    fs.failPathEnding = 'names.jsonl';
    expect(await s.onWhoisic(block('Velmora', 5_000, { sex: 'Male' }))).toBe('stored');
    expect(s.counters.storeFailures).toBe(1);
    expect(s.list()[0].gender).toBe('U');
  });

  it('a gender learned while the index record is missing is kept in the name registry and repaired at the next start', async () => {
    const s = await open();
    fs.failPathEnding = 'index.jsonl';
    await s.onLogin('Velmora');
    fs.failPathEnding = undefined;
    await s.onWhoisic(block('Velmora', 5_000, { sex: 'Male' }));
    const again = await open();
    expect(again.list().map((c) => c.codename)).toEqual([`${CONSTELLATIONS[0]}-M`]);
  });

  it('repairs a stale index gender at the next start', async () => {
    const s = await open();
    await s.onLogin('Velmora');
    fs.failPathEnding = 'index.jsonl';
    await s.onWhoisic(block('Velmora', 5_000, { sex: 'Male' })); // names gets M, the index write fails
    fs.failPathEnding = undefined;
    expect(s.list()[0].gender).toBe('U');
    const again = await open();
    expect(again.list()[0].gender).toBe('M');
    expect(again.list()).toHaveLength(1);
  });
});

describe('reading', () => {
  it('lists the newest players first', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    clock += 100;
    await s.onLogin('Velmora');
    clock += 100;
    await s.onLogin('Quenta');
    expect(s.list().map((c) => c.codename)).toEqual(['Agate-F', `${CONSTELLATIONS[0]}-U`, 'Agate-M']);
    clock += 100;
    await s.onLogin('Zorvak');
    expect(s.list()[0].codename).toBe('Agate-M');
  });

  it('orders characters last seen together by id', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    await s.onLogin('Quenta');
    expect(s.list().map((c) => c.codename)).toEqual(['Agate-F', 'Agate-M']);
  });

  it.each(['', 'Agate', 'Agate-X', 'agate-m-', '-M', '../etc-M', 'Agate-MM'])('getDescription(%j) is undefined', async (codename) => {
    const s = await open();
    await s.onLogin('Zorvak');
    await s.onWhoisic(block('Zorvak', 5_000));
    expect(s.getDescription(codename)).toBeUndefined();
  });

  it('is undefined for an unknown character, a character with no description, and the other gender of a test codename', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    expect(s.getDescription('Agate-M')).toBeUndefined();
    await s.onWhoisic(block('Zorvak', 5_000));
    expect(s.getDescription('Nobody-M')).toBeUndefined();
    expect(s.getDescription('Agate-F')).toBeUndefined();
    expect(s.getDescription('Agate-U')).toBeUndefined();
  });

  it('replaces every registered name in the description and fields with its codename (N1)', async () => {
    const s = await open();
    await s.onLogin('Velmora');
    await s.onLogin('Thandric');
    await s.onLogin('Zorvak');
    const text = 'Velmora is tall. Her friend THANDRIC and Zorvak walk with her.';
    const record = block('Velmora', 5_000, { description: [text, 'He is called \x1b[1;31mThandric\x1b[0m by some.'] });
    record.fields.Feature = 'Scar given by Zorvak';
    expect(await s.onWhoisic(record)).toBe('stored');

    const view = s.getDescription(`${CONSTELLATIONS[0]}-U`);
    const body = JSON.stringify(view);
    for (const name of REAL_NAMES) expect(body.toLowerCase()).not.toContain(name);
    expect(view?.text).toContain(`${CONSTELLATIONS[0]}-M is tall`); // the fixture says Sex: Male, so the gender was learned
    expect(view?.text).toContain('Agate-M');
    expect(view?.fields.Feature).toBe('Scar given by Agate-M');
    expect(view?.rawAnsi).toContain(`${CONSTELLATIONS[1]}-U`);
    expect(file('descriptions.jsonl').toLowerCase()).toContain('velmora'); // the stored copy stays verbatim
  });

  it('scrubs registered real names even when the matrix is unavailable', async () => {
    const withMatrix = await open();
    await withMatrix.onLogin('Velmora');
    const s = await open(null);
    await s.onWhoisic(block('Velmora', 5_000, { description: ['Velmora waves.'] }));
    expect(s.getDescription(`${CONSTELLATIONS[0]}-U`)?.text).toBe(`${CONSTELLATIONS[0]}-M waves.`);
  });

  it('never writes a real name outside names.jsonl', async () => {
    const s = await open();
    await s.onLogin('Velmora');
    await s.onLogin('Zorvak');
    await s.onWhoisic(block('Velmora', 5_000, { description: ['plain description'] }));
    for (const [path, content] of fs.files) {
      if (path.endsWith('names.jsonl')) continue;
      for (const name of REAL_NAMES) expect(content.toLowerCase()).not.toContain(name);
    }
    expect(file('names.jsonl').toLowerCase()).toContain('velmora');
    expect(JSON.stringify(s.list()).toLowerCase()).not.toContain('velmora');
  });
});

describe('serialised calls', () => {
  it('a call that throws unexpectedly rejects for its caller but does not block the calls after it', async () => {
    let broken = true;
    const matrix: TestMatrix = {
      rows: 0,
      entries: () => [],
      lookup: () => {
        if (broken) throw new Error('unexpected');
        return undefined;
      },
    };
    const s = await open(matrix);
    await expect(s.onWhoisic(block('Velmora', 5_000))).rejects.toThrow('unexpected');
    broken = false;
    expect(await s.onLogin('Velmora')).toMatchObject({ ok: true, isNew: true });
  });
});

describe('descriptionSuggestion', () => {
  it('offers whoisic for the active character once, as a valid suggestion that always asks', async () => {
    const s = await open();
    expect(s.descriptionSuggestion(true)).toBeUndefined(); // nobody logged in
    await s.onLogin('Velmora');
    const suggestion = s.descriptionSuggestion(true);
    expect(suggestion).toMatchObject({
      id: `whoisic-real-${CONSTELLATIONS[0]}`,
      character: `${CONSTELLATIONS[0]}-U`,
      kind: 'info',
      sphere: 'interaction',
      command: 'whoisic Velmora',
      confidence: null,
      situationKey: 'whoisic-self',
    });
    expect(validateSuggestion(suggestion).ok).toBe(true);
    expect(s.descriptionSuggestion(false)).toBeUndefined(); // not connected
  });

  it('is not offered once a description exists, or after the session closed', async () => {
    const s = await open();
    await s.onLogin('Zorvak');
    expect(s.descriptionSuggestion(true)?.character).toBe('Agate-M');
    s.onSessionClosed();
    expect(s.descriptionSuggestion(true)).toBeUndefined();
    await s.onLogin('Zorvak');
    await s.onWhoisic(block('Zorvak', 5_000));
    expect(s.descriptionSuggestion(true)).toBeUndefined();
  });
});

describe('open', () => {
  it('reports lines it could not use', async () => {
    seed('names.jsonl', 'not json\n');
    seed('index.jsonl', '{"v":1,"r":{"id":"bad"}}\n');
    const { skipped } = await CharacterService.open({ fs, dir: DIR, matrix: MATRIX, now: () => clock });
    expect(skipped).toBe(2);
  });
});
