import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { stockGroupsFile, type GroupEntry } from '@shatteredarchive/merc-area';

import { GroupsStore } from '../groups-store.js';
import { registerGroupsRoutes } from './groups.js';

function startApp(dir: string, writeEnabled: boolean): Promise<{ server: Server; base: string }> {
  const app = express();
  registerGroupsRoutes(app, new GroupsStore(dir, writeEnabled));
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

const attack = (groups: GroupEntry[]) => groups.find((g) => g.name === 'attack')!;

describe('groups routes (writes DISABLED)', () => {
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-groups-ro-'));
    ({ server, base } = await startApp(dir, false));
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/groups falls back to the compiled stock table when no overlay exists', async () => {
    const res = await fetch(`${base}/api/groups`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: GroupEntry[]; source: string };
    expect(body.source).toBe('stock');
    expect(body.groups.length).toBe(27);
    expect(attack(body.groups).ratings).toEqual([-1, 5, -1, 8]);
  });

  it('POST /api/groups/preview emits the exact file text and 400s a membership cycle', async () => {
    const model = { groups: [attack(stockGroupsFile().groups)] };
    model.groups[0].ratings[1] = 3;
    const res = await fetch(`${base}/api/groups/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string };
    expect(body.text.startsWith('V1\nattack~\n-1 3 -1 8 7\ndemonfire~\n')).toBe(true);
    expect(body.text.endsWith('$~\n')).toBe(true);

    const beguiling = stockGroupsFile().groups.find((g) => g.name === 'beguiling')!;
    beguiling.members = [...beguiling.members, 'mage default']; // mage default lists beguiling → cycle
    const badRes = await fetch(`${base}/api/groups/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: [beguiling] }),
    });
    expect(badRes.status).toBe(400);
    expect(((await badRes.json()) as { error: string }).error).toContain('cycle');
  });

  it('PUT /api/groups is gated off (403) and writes nothing', async () => {
    const res = await fetch(`${base}/api/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockGroupsFile()),
    });
    expect(res.status).toBe(403);
    expect(fs.existsSync(path.join(dir, 'groups.dat'))).toBe(false);
  });
});

describe('groups routes (writes ENABLED)', () => {
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-groups-rw-'));
    ({ server, base } = await startApp(dir, true));
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('PUT saves, GET reads it back as source=overlay, second PUT backs up, DELETE reverts (Phase 8)', async () => {
    const model = stockGroupsFile();
    attack(model.groups).ratings[1] = 3;

    const put = await fetch(`${base}/api/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { saved: boolean; note: string; backupPath: string | null };
    expect(putBody.saved).toBe(true);
    expect(putBody.note).toContain('copyover');
    expect(putBody.backupPath).toBeNull(); // first write, nothing to back up
    expect(fs.readFileSync(path.join(dir, 'groups.dat'), 'utf8')).toContain('attack~\n-1 3 -1 8 7');

    const got = (await (await fetch(`${base}/api/groups`)).json()) as { groups: GroupEntry[]; source: string };
    expect(got.source).toBe('overlay');
    expect(attack(got.groups).ratings[1]).toBe(3);

    attack(model.groups).ratings[1] = 4;
    const put2 = await fetch(`${base}/api/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(put2.status).toBe(200);
    expect(((await put2.json()) as { backupPath: string | null }).backupPath).toContain('groups.dat.');

    const del = await fetch(`${base}/api/groups`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(((await del.json()) as { removed: boolean }).removed).toBe(true);
    expect(fs.existsSync(path.join(dir, 'groups.dat'))).toBe(false);
    const back = (await (await fetch(`${base}/api/groups`)).json()) as { source: string };
    expect(back.source).toBe('stock');
  });

  it('PUT with an unknown member 400s and leaves the disk untouched', async () => {
    const model = stockGroupsFile();
    attack(model.groups).members = ['no such member'];
    const res = await fetch(`${base}/api/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('no such member');
    expect(fs.existsSync(path.join(dir, 'groups.dat'))).toBe(false);
  });

  it('GET with a corrupt overlay on disk reports the parse error and serves stock', async () => {
    fs.writeFileSync(path.join(dir, 'groups.dat'), 'V1\nattack~\nnot numbers\n$~\n', 'utf8');
    const res = (await (await fetch(`${base}/api/groups`)).json()) as {
      source: string;
      parseError?: string;
      groups: GroupEntry[];
    };
    expect(res.source).toBe('stock');
    expect(res.parseError).toBeTruthy();
    expect(attack(res.groups).ratings[1]).toBe(5);
    fs.rmSync(path.join(dir, 'groups.dat'));
  });
});

describe('groups conditional saves (Phase 12 baseHash)', () => {
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-groups-hash-'));
    ({ server, base } = await startApp(dir, true));
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const put = (body: unknown) =>
    fetch(`${base}/api/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('runs the baseHash matrix: null first save, stale 409 (disk untouched), fresh save, absent = legacy', async () => {
    const overlayPath = path.join(dir, 'groups.dat');
    const model = stockGroupsFile();

    const before = (await (await fetch(`${base}/api/groups`)).json()) as { baseHash: string | null };
    expect(before.baseHash).toBeNull();

    const first = await put({ ...model, baseHash: null });
    expect(first.status).toBe(200);
    const h1 = ((await first.json()) as { hash: string }).hash;
    expect(((await (await fetch(`${base}/api/groups`)).json()) as { baseHash: string | null }).baseHash).toBe(h1);

    const diskBefore = fs.readFileSync(overlayPath, 'utf8');
    const stale = await put({ ...model, baseHash: null });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { currentHash: string }).currentHash).toBe(h1);
    expect(fs.readFileSync(overlayPath, 'utf8')).toBe(diskBefore);

    expect((await put({ ...model, baseHash: h1 })).status).toBe(200);
    expect((await put(model)).status).toBe(200);
  });
});
