import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { parseAreaFile, emitAreaFile, type AreaHeaderSection } from '@shatteredarchive/merc-area';

import { AreaStore } from '../area-store.js';
import { registerImportRoutes } from './import.js';
import { registerAreaRoutes } from './areas.js';

const TINY_AREA = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#MOBILES
#101
guard test~
the test guard~
A test guard stands here.
~
He looks thoroughly bored.
~
human~
1 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
#0

#OBJECTS
#0

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
S
#0

#RESETS
S

#SHOPS
0

#SPECIALS
S

#$
`;

/** A valid importable area derived from TINY_AREA, shifted to a free vnum range. */
function makeImportText(opts: { file?: string; minVnum?: number; maxVnum?: number } = {}): string {
  const area = parseAreaFile(TINY_AREA);
  const header = area.sections.find((s): s is AreaHeaderSection => s.kind === 'area')!;
  header.fileName = opts.file ?? 'imported.are';
  header.name = 'Imported';
  header.minVnum = opts.minVnum ?? 200;
  header.maxVnum = opts.maxVnum ?? 299;
  for (const s of area.sections) {
    if (s.kind === 'mobiles') for (const m of s.mobiles) m.vnum += 100;
    if (s.kind === 'rooms') for (const r of s.rooms) r.vnum += 100;
  }
  return emitAreaFile(area);
}

interface TestServer {
  server: Server;
  base: string;
  dir: string;
}

async function startServer(writeEnabled: boolean): Promise<TestServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-import-'));
  fs.writeFileSync(path.join(dir, 'area.lst'), 'tiny.are\n$\n');
  fs.writeFileSync(path.join(dir, 'tiny.are'), TINY_AREA);

  const app = express();
  const store = new AreaStore(dir, writeEnabled);
  // Same order as app.ts: the scoped 2mb import parser before the app-wide 1mb one.
  registerImportRoutes(app, store);
  registerAreaRoutes(app, store);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}`, dir });
    });
  });
}

async function stopServer(t: TestServer): Promise<void> {
  await new Promise<void>((resolve, reject) => t.server.close((err) => (err ? reject(err) : resolve())));
  fs.rmSync(t.dir, { recursive: true, force: true });
}

function preview(base: string, file: string, text: string): Promise<Response> {
  return fetch(`${base}/api/import/area/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, text }),
  });
}

function commit(base: string, file: string, text: string, overwrite?: boolean): Promise<Response> {
  return fetch(`${base}/api/import/area`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, text, ...(overwrite === undefined ? {} : { overwrite }) }),
  });
}

interface ReportBody {
  report: {
    errors: string[];
    warnings: string[];
    externalRefs: { kind: string; vnum: number; where: string; file: string; name: string }[];
    exists: boolean;
    registered: boolean;
    normalizedText: string | null;
    summary: Record<string, number> | null;
  };
}

describe('.are import (writes ON)', () => {
  let t: TestServer;
  beforeAll(async () => {
    t = await startServer(true);
  });
  afterAll(async () => {
    await stopServer(t);
  });

  it('previews a clean new file: empty errors, entity summary, canonical text, no disk writes', async () => {
    const text = makeImportText();
    const res = await preview(t.base, 'imported.are', text);
    expect(res.status).toBe(200);
    const { report } = (await res.json()) as ReportBody;
    expect(report.errors).toEqual([]);
    expect(report.exists).toBe(false);
    expect(report.registered).toBe(false);
    expect(report.normalizedText).toBe(text);
    expect(report.summary).toMatchObject({ mobiles: 1, rooms: 1 });
    expect(fs.existsSync(path.join(t.dir, 'imported.are'))).toBe(false);
    expect(fs.readFileSync(path.join(t.dir, 'area.lst'), 'utf8')).not.toContain('imported.are');
  });

  it('reports a broken file with errors and never writes; commit of it is 400', async () => {
    const res = await preview(t.base, 'broken.are', 'this is not an area file at all');
    expect(res.status).toBe(200);
    const { report } = (await res.json()) as ReportBody;
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.normalizedText).toBeNull();
    const put = await commit(t.base, 'broken.are', 'this is not an area file at all');
    expect(put.status).toBe(400);
    expect(fs.existsSync(path.join(t.dir, 'broken.are'))).toBe(false);
  });

  it('flags a vnum-range overlap with a listed area as an error', async () => {
    const text = makeImportText({ file: 'overlap.are', minVnum: 150, maxVnum: 299 });
    const { report } = (await (await preview(t.base, 'overlap.are', text)).json()) as ReportBody;
    expect(report.errors.some((e) => e.includes('overlaps tiny.are'))).toBe(true);
    expect((await commit(t.base, 'overlap.are', text)).status).toBe(400);
    expect(fs.existsSync(path.join(t.dir, 'overlap.are'))).toBe(false);
  });

  it('commits a clean new file: byte-identical on disk, registered in area.lst, copyover required', async () => {
    const text = makeImportText();
    const res = await commit(t.base, 'imported.are', text);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { imported: boolean; requiresCopyover: boolean; lstBackupPath: string | null };
    expect(body.imported).toBe(true);
    expect(body.requiresCopyover).toBe(true);
    expect(body.lstBackupPath).toBeTruthy();
    expect(fs.readFileSync(path.join(t.dir, 'imported.are'), 'utf8')).toBe(text);
    const lst = fs.readFileSync(path.join(t.dir, 'area.lst'), 'utf8');
    expect(lst.split(/\r?\n/)).toContain('imported.are');
    expect(lst.trim().endsWith('$')).toBe(true);
  });

  it('requires the explicit overwrite flag for an existing file (409), then backs up and replaces', async () => {
    const text = makeImportText();
    expect((await commit(t.base, 'imported.are', text)).status).toBe(409);

    const res = await commit(t.base, 'imported.are', text, true);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { backupPath: string | null; requiresCopyover: boolean; lstBackupPath: string | null };
    expect(body.backupPath).toBeTruthy();
    expect(fs.existsSync(body.backupPath as string)).toBe(true);
    // already listed: no re-registration, hot reload suffices
    expect(body.requiresCopyover).toBe(false);
    expect(body.lstBackupPath).toBeNull();
    const lst = fs.readFileSync(path.join(t.dir, 'area.lst'), 'utf8');
    expect(lst.split(/\r?\n/).filter((l) => l === 'imported.are')).toHaveLength(1);
  });

  it('accepts an import body above the app-wide 1mb JSON cap (scoped 2mb parser)', async () => {
    // A valid area whose room description pushes the payload past 1mb.
    const area = parseAreaFile(makeImportText({ file: 'big.are', minVnum: 300, maxVnum: 399 }));
    const header = area.sections.find((s): s is AreaHeaderSection => s.kind === 'area')!;
    header.minVnum = 300;
    header.maxVnum = 399;
    for (const s of area.sections) {
      if (s.kind === 'mobiles') for (const m of s.mobiles) m.vnum += 100;
      if (s.kind === 'rooms')
        for (const r of s.rooms) {
          r.vnum += 100;
          r.description = `${'a big and padded description line\n'.repeat(35_000)}`;
        }
    }
    const text = emitAreaFile(area);
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(1024 * 1024);
    const res = await preview(t.base, 'big.are', text);
    expect(res.status).toBe(200);
    const { report } = (await res.json()) as ReportBody;
    expect(report.errors).toEqual([]);
  });

  it('rejects oversized and binary uploads at the store boundary', async () => {
    const store = new AreaStore(t.dir, true);
    expect(() => store.importArea('huge.are', 'x'.repeat(3 * 1024 * 1024))).toThrow(/2 MB limit/);
    expect(() => store.importArea('nul.are', `#AREA\u0000`)).toThrow(/binary/);
    expect(() => store.importArea('../evil.are', TINY_AREA)).toThrow(/invalid area file name/);
  });

  it('resolves refs into listed areas as externalRefs; only nowhere-defined vnums warn (Phase 11)', async () => {
    const area = parseAreaFile(makeImportText({ file: 'linked.are', minVnum: 400, maxVnum: 499 }));
    for (const s of area.sections) {
      if (s.kind === 'mobiles') for (const m of s.mobiles) m.vnum += 200;
      if (s.kind === 'rooms') for (const r of s.rooms) r.vnum += 200;
    }
    const rooms = area.sections.find((s): s is Extract<typeof s, { kind: 'rooms' }> => s.kind === 'rooms')!;
    rooms.rooms[0].exits = [
      { door: 0, description: '', keyword: '', locks: 0, key: 0, toVnum: 100 }, // tiny.are's room
      { door: 1, description: '', keyword: '', locks: 0, key: 0, toVnum: 9999 }, // defined nowhere
    ];

    const res = await preview(t.base, 'linked.are', emitAreaFile(area));
    expect(res.status).toBe(200);
    const { report } = (await res.json()) as ReportBody;
    expect(report.errors).toEqual([]);
    expect(report.externalRefs).toEqual([
      expect.objectContaining({ kind: 'room', vnum: 100, file: 'tiny.are', name: 'The Test Room' }),
    ]);
    const warned = report.warnings.join('; ');
    expect(warned).toContain('room 9999');
    expect(warned).toContain('any listed area');
    expect(warned).not.toContain('room 100 ');
  });
});

describe('.are import (writes gated OFF)', () => {
  let t: TestServer;
  beforeAll(async () => {
    t = await startServer(false);
  });
  afterAll(async () => {
    await stopServer(t);
  });

  it('preview still works, commit is 403 and touches nothing', async () => {
    const text = makeImportText();
    expect((await preview(t.base, 'imported.are', text)).status).toBe(200);
    expect((await commit(t.base, 'imported.are', text)).status).toBe(403);
    expect(fs.existsSync(path.join(t.dir, 'imported.are'))).toBe(false);
  });
});
