import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { TAR_CHAR_OFFENSIVE, type SpellSpec } from '@shatteredarchive/merc-area';

import { registerRoutes } from '../app.js';
import type { MudBuilderConfig } from '../config.js';

function makeConfig(dir: string, overrides: Partial<MudBuilderConfig> = {}): MudBuilderConfig {
  return {
    mercMudPath: dir,
    mercAreaDir: '.',
    areaPath: dir,
    writeEnabled: true,
    authEnabled: true,
    authDataPath: path.join(dir, 'auth'),
    auditDataPath: path.join(dir, 'backups'),
    authServerUrl: 'http://localhost:62000',
    rebuildEnabled: false,
    mercMudRepoPath: dir,
    mercMudHostPath: 'C:/Projects/merc-mud',
    shatteredArchiveRepoPath: 'C:/Projects/ShatteredArchive',
    shatteredArchiveHostPath: 'C:/Projects/ShatteredArchive',
    ...overrides,
  };
}

function startApp(config: MudBuilderConfig): Promise<{ server: Server; base: string }> {
  const app = express();
  registerRoutes(app, config);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

function readMasterKey(dir: string): string {
  const raw = fs.readFileSync(path.join(dir, 'auth', 'builder-auth.json'), 'utf8');
  return (JSON.parse(raw) as { masterKey: string }).masterKey;
}

const testBolt: SpellSpec = {
  name: 'test bolt',
  funName: 'spell_test_bolt',
  archetype: 'damage',
  target: TAR_CHAR_OFFENSIVE,
  damage: { baseDiceCount: 6, perLevelDiv: 2, diceSize: 8, saveType: 'half', damageType: 'fire' },
  datDefaults: { levels: [10, 10, 10, 10], ratings: [1, 1, 1, 1], mana: 20, lag: 12, minPosition: 7, damageNoun: 'test bolt', msgOff: '!Test Bolt!' },
};

function putSpecs(base: string, specs: SpellSpec[], token?: string, baseHash?: string | null): Promise<Response> {
  return fetch(`${base}/api/codegen/spells`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ specs, ...(baseHash !== undefined ? { baseHash } : {}) }),
  });
}

describe('codegen routes', () => {
  let server: Server;
  let base: string;
  let dir: string;
  let master: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-codegen-'));
    ({ server, base } = await startApp(makeConfig(dir)));
    master = readMasterKey(dir);
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('GET with no file yet returns empty specs and a null baseHash', async () => {
    const res = await fetch(`${base}/api/codegen/spells`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ specs: [], baseHash: null });
  });

  it('PUT without a bearer token is gated off (401) and writes nothing', async () => {
    const res = await putSpecs(base, [testBolt]);
    expect(res.status).toBe(401);
    expect(fs.existsSync(path.join(dir, 'codegen', 'spells.json'))).toBe(false);
  });

  it('PUT an invalid spec 400s with the validation error and writes nothing', async () => {
    const bad: SpellSpec = { ...testBolt, funName: 'NotValid' };
    const res = await putSpecs(base, [bad], master);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('must match');
    expect(fs.existsSync(path.join(dir, 'codegen', 'spells.json'))).toBe(false);
  });

  it('PUT with the master key saves, GET reads it back, and the write is audited', async () => {
    const res = await putSpecs(base, [testBolt], master);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hash: string; saved: boolean };
    expect(body.saved).toBe(true);

    const got = (await (await fetch(`${base}/api/codegen/spells`)).json()) as { specs: SpellSpec[]; baseHash: string };
    expect(got.specs).toEqual([testBolt]);
    expect(got.baseHash).toBe(body.hash);

    const audit = fs.readFileSync(path.join(dir, 'backups', 'audit.log'), 'utf8');
    const lines = audit.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    const put = lines.find((l) => l.route === '/api/codegen/spells' && l.method === 'PUT');
    expect(put).toBeDefined();
    expect(put!.actor).toBe('master');
  });

  it('a stale baseHash 409s with the current hash and leaves the file untouched', async () => {
    const before = fs.readFileSync(path.join(dir, 'codegen', 'spells.json'), 'utf8');
    const res = await putSpecs(base, [testBolt], master, 'not-the-real-hash');
    expect(res.status).toBe(409);
    expect((await res.json()) as { currentHash: string }).toHaveProperty('currentHash');
    expect(fs.readFileSync(path.join(dir, 'codegen', 'spells.json'), 'utf8')).toBe(before);
  });

  it('rejects a spec whose name collides with a stock skill', async () => {
    const res = await putSpecs(base, [{ ...testBolt, funName: 'spell_test_bolt_2', name: 'armor' }], master);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('collides with a stock skill');
  });

  it('GET the patch for a stored spec returns the labeled C patch text', async () => {
    const res = await fetch(`${base}/api/codegen/spells/spell_test_bolt/patch`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('--- magic.h');
    expect(text).toContain('--- magic.c');
    expect(text).toContain('--- skills_data.c');
    expect(text).toContain('void spell_test_bolt(int sn, int level, CHAR_DATA *ch, void *vo, int target)');
  });

  it('GET the patch for an unknown funName 404s', async () => {
    const res = await fetch(`${base}/api/codegen/spells/spell_does_not_exist/patch`);
    expect(res.status).toBe(404);
  });
});
