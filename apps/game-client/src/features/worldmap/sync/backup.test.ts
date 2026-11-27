// The map backup: what is sent (ids only, this world only), what comes back into the visit record, and how each failure reads.
import type { AddRoomSpec } from '@shatteredarchive/shattered-maps-core';
import { memoryKvStore } from '../../autoleveling/autoleveling-idb';
import { createVisitStore } from '../fog/visits';
import { createLayerStore } from '../mine/layerStore';
import type { Scope } from '../fog/identity';
import { eraseBackup, localDocument, syncBackup, type BackupApi, type MapBackupDocument } from './backup';

jest.mock('../../auth/siteApi', () => ({ siteApiBase: () => 'https://site.test' }));

const scope: Scope = { world: 'dsl', account: 'local', character: 'Aldric-M' };

const room = (title: string): AddRoomSpec => ({
  title,
  place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' },
  exits: {},
  source: 'manual',
  at: '2026-11-12',
});

function setup() {
  const kv = memoryKvStore();
  let n = 0;
  return { visits: createVisitStore(kv), layers: createLayerStore(kv, () => ((n += 1) * 0.0371) % 1) };
}

function fakeApi(answer: Awaited<ReturnType<BackupApi['sync']>>): BackupApi & { sent: MapBackupDocument[] } {
  const sent: MapBackupDocument[] = [];
  return {
    sent,
    sync: async (doc) => {
      sent.push(doc);
      return answer;
    },
    erase: async () => ({ kind: 'ok', data: undefined }),
  };
}

describe('localDocument', () => {
  it('holds only ids: visited rooms per character and the ids of the rooms added, for the one world', async () => {
    const { visits, layers } = setup();
    await visits.record(scope, 'r2');
    await visits.record(scope, 'r1');
    await visits.record({ ...scope, character: 'Mira-F' }, 'r3');
    await visits.record({ ...scope, world: 'other' }, 'x9');
    const added = await layers.add('dsl', room('Pier'));
    if (!added.ok) throw new Error('setup');
    await layers.add('other', room('Elsewhere'));

    const doc = await localDocument({ world: 'dsl', visits, layers, scope });
    expect(doc).toEqual({
      version: 1,
      worlds: { dsl: { visited: { 'Aldric-M': ['r1', 'r2'], 'Mira-F': ['r3'] }, added: [added.roomId] } },
    });
    expect(JSON.stringify(doc)).not.toContain('Pier');
  });

  it('asks the token and the game who is playing when no scope is given (no sign-in: the "local" account)', async () => {
    const { visits, layers } = setup();
    await visits.record({ world: 'dsl', account: 'local', character: '' }, 'r7');
    expect(await localDocument({ world: 'dsl', visits, layers })).toEqual({ version: 1, worlds: { dsl: { visited: { '': ['r7'] }, added: [] } } });
  });

  it('is an empty world when nothing was explored or added', async () => {
    const { visits, layers } = setup();
    expect(await localDocument({ world: 'dsl', visits, layers, scope })).toEqual({ version: 1, worlds: { dsl: { visited: {}, added: [] } } });
  });
});

describe('syncBackup', () => {
  it('sends the lists, takes the union back into the visit record and counts what is new', async () => {
    const { visits, layers } = setup();
    await visits.record(scope, 'r1');
    const mine = await layers.add('dsl', room('Pier'));
    if (!mine.ok) throw new Error('setup');
    const api = fakeApi({
      kind: 'ok',
      data: {
        version: 1,
        worlds: { dsl: { visited: { 'Aldric-M': ['r1', 'r2'], 'Mira-F': ['r2', 'r3'] }, added: [mine.roomId, 'far-room'] } },
      },
    });

    const outcome = await syncBackup({ world: 'dsl', visits, layers, api, scope });

    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]!.worlds.dsl!.visited).toEqual({ 'Aldric-M': ['r1'] });
    expect(outcome).toEqual({ kind: 'done', explored: 3, exploredNew: 3, added: 2, addedElsewhere: 1 });
    expect([...visits.visited(scope, 'user')].sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('a second press with nothing new reports zero new rooms', async () => {
    const { visits, layers } = setup();
    await visits.record(scope, 'r1');
    const api = fakeApi({ kind: 'ok', data: { version: 1, worlds: { dsl: { visited: { 'Aldric-M': ['r1'] }, added: [] } } } });
    expect(await syncBackup({ world: 'dsl', visits, layers, api, scope })).toEqual({ kind: 'done', explored: 1, exploredNew: 0, added: 0, addedElsewhere: 0 });
  });

  it('an answer without this world (or without worlds) changes nothing and counts zero', async () => {
    const { visits, layers } = setup();
    await visits.record(scope, 'r1');
    const other = fakeApi({ kind: 'ok', data: { version: 1, worlds: { other: { visited: { A: ['x1'] }, added: [] } } } });
    expect(await syncBackup({ world: 'dsl', visits, layers, api: other, scope })).toEqual({ kind: 'done', explored: 0, exploredNew: 0, added: 0, addedElsewhere: 0 });
    const bare = fakeApi({ kind: 'ok', data: undefined as unknown as MapBackupDocument });
    expect((await syncBackup({ world: 'dsl', visits, layers, api: bare, scope })).kind).toBe('done');
    expect([...visits.visited(scope, 'user')]).toEqual(['r1']);
  });

  it('a signed-out player gets signed-out and the record is untouched', async () => {
    const { visits, layers } = setup();
    await visits.record(scope, 'r1');
    const api = fakeApi({ kind: 'unauthenticated' });
    expect(await syncBackup({ world: 'dsl', visits, layers, api, scope })).toEqual({ kind: 'signed-out' });
    expect([...visits.visited(scope, 'user')]).toEqual(['r1']);
  });

  it('a refusal from the site (too big, for instance) keeps its message and changes nothing', async () => {
    const { visits, layers } = setup();
    const api = fakeApi({ kind: 'error', message: 'world dsl has more than 50 characters' });
    expect(await syncBackup({ world: 'dsl', visits, layers, api, scope })).toEqual({ kind: 'error', message: 'world dsl has more than 50 characters' });
    expect(visits.byCharacter(scope)).toEqual({});
  });
});

describe('the defaults (no injected api or scope)', () => {
  it('without a sign-in token the site calls answer signed-out and nothing leaves the browser', async () => {
    const { visits, layers } = setup();
    const original = globalThis.fetch;
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      expect(await syncBackup({ world: 'dsl', visits, layers })).toEqual({ kind: 'signed-out' });
      expect(await eraseBackup()).toEqual({ kind: 'signed-out' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('eraseBackup', () => {
  it('says erased on success, signed-out without a session and the message on a failure', async () => {
    const base = fakeApi({ kind: 'unauthenticated' });
    expect(await eraseBackup(base)).toBe('erased');
    expect(await eraseBackup({ ...base, erase: async () => ({ kind: 'unauthenticated' }) })).toEqual({ kind: 'signed-out' });
    expect(await eraseBackup({ ...base, erase: async () => ({ kind: 'error', message: 'down' }) })).toEqual({ kind: 'error', message: 'down' });
  });
});
