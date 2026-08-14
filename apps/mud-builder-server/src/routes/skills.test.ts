import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { stockSkillsFile, type SkillEntry } from '@shatteredarchive/merc-area';

import { SkillsStore } from '../skills-store.js';
import { registerSkillsRoutes } from './skills.js';

function startApp(dir: string, writeEnabled: boolean): Promise<{ server: Server; base: string }> {
  const app = express();
  registerSkillsRoutes(app, new SkillsStore(dir, writeEnabled));
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

const armor = (skills: SkillEntry[]) => skills.find((s) => s.name === 'armor')!;

describe('skills routes (writes DISABLED)', () => {
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-skills-ro-'));
    ({ server, base } = await startApp(dir, false));
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/skills falls back to the compiled stock table when no overlay exists', async () => {
    const res = await fetch(`${base}/api/skills`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: SkillEntry[]; source: string };
    expect(body.source).toBe('stock');
    expect(body.skills.length).toBeGreaterThan(100);
    expect(armor(body.skills).minMana).toBe(5);
  });

  it('POST /api/skills/preview emits the exact file text and 400s invalid models', async () => {
    const model = { skills: [armor(stockSkillsFile().skills)] };
    model.skills[0].minMana = 42;
    const res = await fetch(`${base}/api/skills/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string };
    expect(body.text.startsWith('V1\narmor~\nspell_armor 2 8 7 2 10 5 1 1 2 2 42 12\n')).toBe(true);
    expect(body.text.endsWith('$~\n')).toBe(true);

    const bad = { skills: [{ ...armor(stockSkillsFile().skills), spellFun: 'spell_nope' }] };
    const badRes = await fetch(`${base}/api/skills/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bad),
    });
    expect(badRes.status).toBe(400);
    expect(((await badRes.json()) as { error: string }).error).toContain('spell_nope');
  });

  it('PUT /api/skills is gated off (403) and writes nothing', async () => {
    const res = await fetch(`${base}/api/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockSkillsFile()),
    });
    expect(res.status).toBe(403);
    expect(fs.existsSync(path.join(dir, 'skills.dat'))).toBe(false);
  });
});

describe('skills routes (writes ENABLED)', () => {
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-skills-rw-'));
    ({ server, base } = await startApp(dir, true));
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('PUT saves, GET reads it back as source=overlay, second PUT backs up, DELETE reverts (Phase 7)', async () => {
    const model = stockSkillsFile();
    armor(model.skills).minMana = 33;
    armor(model.skills).msgOff = 'Your test armor fades.';

    const put = await fetch(`${base}/api/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { saved: boolean; note: string; backupPath: string | null };
    expect(putBody.saved).toBe(true);
    expect(putBody.note).toContain('copyover');
    expect(putBody.backupPath).toBeNull(); // first write, nothing to back up
    expect(fs.readFileSync(path.join(dir, 'skills.dat'), 'utf8')).toContain('spell_armor 2 8 7 2 10 5 1 1 2 2 33 12');

    const got = (await (await fetch(`${base}/api/skills`)).json()) as { skills: SkillEntry[]; source: string };
    expect(got.source).toBe('overlay');
    expect(armor(got.skills).minMana).toBe(33);

    armor(model.skills).minMana = 34;
    const put2 = await fetch(`${base}/api/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(put2.status).toBe(200);
    expect(((await put2.json()) as { backupPath: string | null }).backupPath).toContain('skills.dat.');

    const del = await fetch(`${base}/api/skills`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(((await del.json()) as { removed: boolean }).removed).toBe(true);
    expect(fs.existsSync(path.join(dir, 'skills.dat'))).toBe(false);
    const back = (await (await fetch(`${base}/api/skills`)).json()) as { source: string };
    expect(back.source).toBe('stock');
  });

  it('PUT 400s an unproven (spellFun, target) pair without touching disk', async () => {
    const model = { skills: [{ ...armor(stockSkillsFile().skills), spellFun: 'spell_acid_blast' }] }; // target stays 2
    const res = await fetch(`${base}/api/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('not a combination');
    expect(fs.existsSync(path.join(dir, 'skills.dat'))).toBe(false);
  });

  it('GET survives a corrupt on-disk overlay by falling back to stock with parseError', async () => {
    fs.writeFileSync(path.join(dir, 'skills.dat'), 'V9\ngarbage\n');
    const res = await fetch(`${base}/api/skills`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; parseError?: string };
    expect(body.source).toBe('stock');
    expect(body.parseError).toContain('V1');
    fs.rmSync(path.join(dir, 'skills.dat'));
  });
});

describe('skills conditional saves (Phase 12 baseHash)', () => {
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-skills-hash-'));
    ({ server, base } = await startApp(dir, true));
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const put = (body: unknown) =>
    fetch(`${base}/api/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('runs the full baseHash matrix: null first save, fresh, stale 409 (disk untouched), absent = legacy, bad type 400', async () => {
    const overlayPath = path.join(dir, 'skills.dat');
    const model = stockSkillsFile();
    armor(model.skills).minMana = 41;

    // stock state: GET reports baseHash null
    const before = (await (await fetch(`${base}/api/skills`)).json()) as { baseHash: string | null };
    expect(before.baseHash).toBeNull();

    // baseHash null = "no overlay existed" — first save goes through and returns the new hash
    const first = await put({ ...model, baseHash: null });
    expect(first.status).toBe(200);
    const h1 = ((await first.json()) as { hash: string }).hash;
    expect(typeof h1).toBe('string');
    expect(((await (await fetch(`${base}/api/skills`)).json()) as { baseHash: string | null }).baseHash).toBe(h1);

    // a second editor still holding null now conflicts, and disk is untouched
    const diskBefore = fs.readFileSync(overlayPath, 'utf8');
    armor(model.skills).minMana = 42;
    const stale = await put({ ...model, baseHash: null });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { currentHash: string }).currentHash).toBe(h1);
    expect(fs.readFileSync(overlayPath, 'utf8')).toBe(diskBefore);

    // the fresh hash saves; a wrong string hash conflicts against the new state
    const second = await put({ ...model, baseHash: h1 });
    expect(second.status).toBe(200);
    const h2 = ((await second.json()) as { hash: string }).hash;
    const wrong = await put({ ...model, baseHash: h1 });
    expect(wrong.status).toBe(409);
    expect(((await wrong.json()) as { currentHash: string }).currentHash).toBe(h2);

    // absent baseHash keeps the legacy unconditional save for raw API users
    armor(model.skills).minMana = 43;
    expect((await put(model)).status).toBe(200);

    // and a non-string non-null baseHash is a 400, not a write
    expect((await put({ ...model, baseHash: 7 })).status).toBe(400);
  });
});
