import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { AreaStore } from '../area-store.js';
import { registerAreaRoutes } from './areas.js';
import { registerReloadRoutes } from './reload.js';

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

interface TestServer {
  server: Server;
  base: string;
  dir: string;
}

async function startServer(writeEnabled: boolean): Promise<TestServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-test-'));
  fs.writeFileSync(path.join(dir, 'area.lst'), 'tiny.are\n$\n');
  fs.writeFileSync(path.join(dir, 'tiny.are'), TINY_AREA);

  const app = express();
  const store = new AreaStore(dir, writeEnabled);
  registerAreaRoutes(app, store);
  registerReloadRoutes(app, store);

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

describe('area routes (writes gated OFF)', () => {
  let t: TestServer;
  beforeAll(async () => {
    t = await startServer(false);
  });
  afterAll(async () => {
    await stopServer(t);
  });

  it('lists areas from area.lst with header info', async () => {
    const res = await fetch(`${t.base}/api/areas`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { areas: { file: string; name?: string }[] };
    expect(body.areas).toHaveLength(1);
    expect(body.areas[0].file).toBe('tiny.are');
    expect(body.areas[0].name).toBe('Tiny');
  });

  it('returns the parsed model for one area', async () => {
    const res = await fetch(`${t.base}/api/areas/tiny.are`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { area: { sections: { kind: string }[] } };
    expect(body.area.sections.map((s) => s.kind)).toContain('rooms');
  });

  it('rejects path traversal in file names', async () => {
    for (const bad of ['..%2F..%2Fetc%2Fpasswd', 'no-extension', 'x%5Cy.are']) {
      const res = await fetch(`${t.base}/api/areas/${bad}`);
      expect([400, 404]).toContain(res.status);
    }
  });

  it('previews an edit with diff, without writing', async () => {
    const getRes = await fetch(`${t.base}/api/areas/tiny.are`);
    const { area } = (await getRes.json()) as { area: any };
    const rooms = area.sections.find((s: any) => s.kind === 'rooms');
    rooms.rooms[0].description = 'A freshly edited test room.\n';

    const res = await fetch(`${t.base}/api/areas/tiny.are/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string; diff: { identical: boolean; removed: string[]; added: string[] } };
    expect(body.text).toContain('A freshly edited test room.');
    expect(body.diff.identical).toBe(false);
    expect(body.diff.removed.join('\n')).toContain('perfectly ordinary');
    expect(body.diff.added.join('\n')).toContain('freshly edited');
    // No write happened.
    expect(fs.readFileSync(path.join(t.dir, 'tiny.are'), 'utf8')).toContain('perfectly ordinary');
  });

  it('downloads the canonical emitted file', async () => {
    const res = await fetch(`${t.base}/api/areas/tiny.are/download`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('tiny.are');
    const text = await res.text();
    expect(text).toContain('#AREA');
    expect(text.endsWith('#$\n')).toBe(true);
  });

  it('refuses PUT and reload with 403 when writes are gated off', async () => {
    const getRes = await fetch(`${t.base}/api/areas/tiny.are`);
    const { area } = (await getRes.json()) as { area: unknown };

    const putRes = await fetch(`${t.base}/api/areas/tiny.are`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(putRes.status).toBe(403);

    const reloadRes = await fetch(`${t.base}/api/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'hot', file: 'tiny.are' }),
    });
    expect(reloadRes.status).toBe(403);

    const createRes = await fetch(`${t.base}/api/areas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'gated.are', name: 'Gated', minVnum: 900, maxVnum: 999 }),
    });
    expect(createRes.status).toBe(403);
    expect(fs.existsSync(path.join(t.dir, 'gated.are'))).toBe(false);
  });

  it('previews scripts with a summary and 400s invalid ones', async () => {
    const getRes = await fetch(`${t.base}/api/areas/tiny.are`);
    const { area } = (await getRes.json()) as { area: any };
    area.sections.splice(area.sections.length, 0, {
      kind: 'scripts',
      scripts: [{ mobVnum: 101, trigger: 'speech', phrase: 'hello', body: 'say Hello yourself, $n!' }],
    });

    const ok = await fetch(`${t.base}/api/areas/tiny.are/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { text: string; scripts: { count: number; perMob: unknown[]; errors: string[] } };
    expect(body.text).toContain('#SCRIPTS');
    expect(body.text).toContain('M 101 speech hello~');
    expect(body.scripts).toEqual({ count: 1, perMob: [{ mobVnum: 101, count: 1 }], errors: [] });

    const badTrigger = JSON.parse(JSON.stringify(area));
    badTrigger.sections.at(-1).scripts[0].trigger = 'sneeze';
    const bad = await fetch(`${t.base}/api/areas/tiny.are/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area: badTrigger }),
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain("unknown trigger 'sneeze'");

    const foreignMob = JSON.parse(JSON.stringify(area));
    foreignMob.sections.at(-1).scripts[0].mobVnum = 9999;
    const bad2 = await fetch(`${t.base}/api/areas/tiny.are/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area: foreignMob }),
    });
    expect(bad2.status).toBe(400);
    expect(((await bad2.json()) as { error: string }).error).toContain('mob 9999');
  });

  it('400s an in-range dangling vnum reference and passes cross-area refs as warnings', async () => {
    const getRes = await fetch(`${t.base}/api/areas/tiny.are`);
    const { area } = (await getRes.json()) as { area: any };
    const resets = area.sections.find((s: any) => s.kind === 'resets');

    // Reset spawning mob 150: in the 100-199 range but not defined → 400.
    resets.resets = [{ command: 'M', ifFlag: 0, arg1: 150, arg2: 1, arg3: 100, arg4: 1, comment: '' }];
    const bad = await fetch(`${t.base}/api/areas/tiny.are/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain('mob 150');

    // Same reset pointing at mob 101 but an out-of-range room → 200 + warning.
    resets.resets = [{ command: 'M', ifFlag: 0, arg1: 101, arg2: 1, arg3: 5000, arg4: 1, comment: '' }];
    const ok = await fetch(`${t.base}/api/areas/tiny.are/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { refs: { errors: string[]; warnings: string[] } };
    expect(body.refs.errors).toEqual([]);
    expect(body.refs.warnings.join('; ')).toContain('room 5000');
  });

  it('rejects malformed bodies with 400, never 500', async () => {
    const res = await fetch(`${t.base}/api/areas/tiny.are/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('area');
  });
});

describe('area routes (writes ENABLED)', () => {
  let t: TestServer;
  beforeAll(async () => {
    t = await startServer(true);
  });
  afterAll(async () => {
    await stopServer(t);
  });

  it('saves atomically with a timestamped backup', async () => {
    const getRes = await fetch(`${t.base}/api/areas/tiny.are`);
    const { area } = (await getRes.json()) as { area: any };
    const rooms = area.sections.find((s: any) => s.kind === 'rooms');
    rooms.rooms[0].name = 'The Renamed Room';

    const res = await fetch(`${t.base}/api/areas/tiny.are`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { saved: boolean; backupPath: string };
    expect(body.saved).toBe(true);
    expect(fs.existsSync(body.backupPath)).toBe(true);
    expect(fs.readFileSync(body.backupPath, 'utf8')).toContain('The Test Room');
    expect(fs.readFileSync(path.join(t.dir, 'tiny.are'), 'utf8')).toContain('The Renamed Room');
  });

  it('conditional saves: GET carries baseHash, fresh hash saves, stale hash 409s with disk untouched (Phase 11)', async () => {
    const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p, 'utf8'), 'utf8').digest('hex');
    const target = path.join(t.dir, 'tiny.are');

    const getRes = await fetch(`${t.base}/api/areas/tiny.are`);
    const loaded = (await getRes.json()) as { area: any; baseHash: string };
    expect(loaded.baseHash).toBe(sha(target));

    const put = (body: unknown) =>
      fetch(`${t.base}/api/areas/tiny.are`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    // Fresh hash saves and returns the NEW hash (client keeps editing without a reload).
    const rooms = loaded.area.sections.find((s: any) => s.kind === 'rooms');
    rooms.rooms[0].name = 'The Conditional Room';
    const ok = await put({ area: loaded.area, baseHash: loaded.baseHash });
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as { saved: boolean; hash: string };
    expect(okBody.saved).toBe(true);
    expect(okBody.hash).toBe(sha(target));
    expect(okBody.hash).not.toBe(loaded.baseHash);

    // The now-stale hash conflicts: 409 carries the current hash, disk untouched.
    const before = fs.readFileSync(target, 'utf8');
    const stale = await put({ area: loaded.area, baseHash: loaded.baseHash });
    expect(stale.status).toBe(409);
    const staleBody = (await stale.json()) as { error: string; currentHash: string };
    expect(staleBody.currentHash).toBe(okBody.hash);
    expect(fs.readFileSync(target, 'utf8')).toBe(before);

    // No baseHash keeps the legacy unconditional save; a non-string one is a 400.
    const legacy = await put({ area: loaded.area });
    expect(legacy.status).toBe(200);
    const bad = await put({ area: loaded.area, baseHash: 42 });
    expect(bad.status).toBe(400);
  });

  it('writes hot and copyover reload signals', async () => {
    const hot = await fetch(`${t.base}/api/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'hot', file: 'tiny.are' }),
    });
    expect(hot.status).toBe(202);
    expect(fs.readFileSync(path.join(t.dir, 'reload.signal'), 'utf8').trim()).toBe('tiny.are');

    const copyover = await fetch(`${t.base}/api/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'copyover' }),
    });
    expect(copyover.status).toBe(202);
    expect(fs.existsSync(path.join(t.dir, 'copyover.signal'))).toBe(true);

    const bad = await fetch(`${t.base}/api/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'sideways' }),
    });
    expect(bad.status).toBe(400);
  });

  it('creates a new area file registered in area.lst (copyover-flagged, Phase 5)', async () => {
    const res = await fetch(`${t.base}/api/areas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'annex.are', name: 'The Annex', minVnum: 300, maxVnum: 399 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { created: boolean; requiresCopyover: boolean; lstBackupPath: string };
    expect(body.created).toBe(true);
    expect(body.requiresCopyover).toBe(true);
    expect(fs.existsSync(body.lstBackupPath)).toBe(true);

    // The .are file parses and the list gained the line BEFORE the terminator.
    const onDisk = fs.readFileSync(path.join(t.dir, 'annex.are'), 'utf8');
    expect(onDisk).toContain('The Annex~');
    const lst = fs.readFileSync(path.join(t.dir, 'area.lst'), 'utf8');
    expect(lst.indexOf('annex.are')).toBeGreaterThan(-1);
    expect(lst.indexOf('annex.are')).toBeLessThan(lst.indexOf('$'));

    // It is immediately listed and readable through the API.
    const list = await fetch(`${t.base}/api/areas`);
    const { areas } = (await list.json()) as { areas: { file: string; name?: string }[] };
    expect(areas.some((a) => a.file === 'annex.are' && a.name === 'The Annex')).toBe(true);
  });

  it('400s an overlapping vnum range and 409s a duplicate file', async () => {
    const overlap = await fetch(`${t.base}/api/areas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'overlap.are', name: 'Overlap', minVnum: 150, maxVnum: 250 }),
    });
    expect(overlap.status).toBe(400);
    const overlapBody = (await overlap.json()) as { error: string };
    expect(overlapBody.error).toContain('overlaps tiny.are');
    expect(fs.existsSync(path.join(t.dir, 'overlap.are'))).toBe(false);

    const dup = await fetch(`${t.base}/api/areas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'tiny.are', name: 'Dup', minVnum: 500, maxVnum: 599 }),
    });
    expect(dup.status).toBe(409);
  });

  it('guards header range edits: shrink-below-used 400s, overlap-on-grow 400s, rename saves (Phase 6)', async () => {
    const getRes = await fetch(`${t.base}/api/areas/tiny.are`);
    const { area } = (await getRes.json()) as { area: any };
    const header = area.sections.find((s: any) => s.kind === 'area');

    // Shrink below a defined vnum: tiny.are defines room 100 and mob 101.
    header.minVnum = 150;
    const shrink = await fetch(`${t.base}/api/areas/tiny.are`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(shrink.status).toBe(400);
    const shrinkBody = (await shrink.json()) as { error: string };
    expect(shrinkBody.error).toContain('100');
    expect(shrinkBody.error).toContain('101');
    expect(fs.readFileSync(path.join(t.dir, 'tiny.are'), 'utf8')).toContain('100 199');

    // Grow into annex.are's 300-399 (created by the Phase 5 test above).
    header.minVnum = 100;
    header.maxVnum = 350;
    const grow = await fetch(`${t.base}/api/areas/tiny.are`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(grow.status).toBe(400);
    expect(((await grow.json()) as { error: string }).error).toContain('overlaps annex.are');

    // A safe grow + rename + credits edit saves and round-trips.
    header.maxVnum = 250;
    header.name = 'Tiny Renamed';
    header.credits = '{ 1 60} Test  Tiny Renamed';
    const okRes = await fetch(`${t.base}/api/areas/tiny.are`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(okRes.status).toBe(200);
    const onDisk = fs.readFileSync(path.join(t.dir, 'tiny.are'), 'utf8');
    expect(onDisk).toContain('Tiny Renamed~');
    expect(onDisk).toContain('100 250');

    // Saving again with the (now unchanged) range skips the range checks.
    const again = await fetch(`${t.base}/api/areas/tiny.are`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(again.status).toBe(200);
  });

  it('refuses a model that cannot round-trip (400, disk untouched)', async () => {
    const getRes = await fetch(`${t.base}/api/areas/tiny.are`);
    const { area } = (await getRes.json()) as { area: any };
    const rooms = area.sections.find((s: any) => s.kind === 'rooms');
    rooms.rooms[0].name = 'Illegal ~ tilde';

    const res = await fetch(`${t.base}/api/areas/tiny.are`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area }),
    });
    expect(res.status).toBe(400);
    const onDisk = fs.readFileSync(path.join(t.dir, 'tiny.are'), 'utf8');
    expect(onDisk).not.toContain('Illegal');
  });

  it('resolves cross-area refs against the world index, with live cache invalidation (Phase 11)', async () => {
    const NEIGHBOR = `#AREA
neighbor.are~
Neighbor~
{ 1 50} Test  Neighbor~
500 599

#MOBILES
#0

#OBJECTS
#0

#ROOMS
#500
The Neighbor Plaza~
A plaza next door.
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
    fs.writeFileSync(path.join(t.dir, 'neighbor.are'), NEIGHBOR);
    const lst = fs.readFileSync(path.join(t.dir, 'area.lst'), 'utf8');
    // Anchored to the terminator LINE. A bare .replace('$', …) hits the first '$' anywhere in
    // the file, which happens to be the terminator today but would silently corrupt the
    // fixture the moment a filename above it contained one.
    fs.writeFileSync(path.join(t.dir, 'area.lst'), lst.replace(/^\$$/m, 'neighbor.are\n$'));

    const { area } = (await (await fetch(`${t.base}/api/areas/tiny.are`)).json()) as { area: any };
    const rooms = area.sections.find((s: any) => s.kind === 'rooms');
    rooms.rooms[0].exits = [{ door: 0, description: '', keyword: '', locks: 0, key: 0, toVnum: 500 }];

    const previewIt = async () => {
      const res = await fetch(`${t.base}/api/areas/tiny.are/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area }),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as {
        refs: { warnings: string[]; external: { kind: string; vnum: number; file: string; name: string }[] };
      };
    };

    // The ref into neighbor.are resolves: a link, not a warning.
    let body = await previewIt();
    expect(body.refs.warnings).toEqual([]);
    expect(body.refs.external).toEqual([
      expect.objectContaining({ kind: 'room', vnum: 500, file: 'neighbor.are', name: 'The Neighbor Plaza' }),
    ]);

    // Change the neighbor on disk — the per-file index cache must refresh.
    fs.writeFileSync(path.join(t.dir, 'neighbor.are'), NEIGHBOR.replace('The Neighbor Plaza', 'The Renamed Plaza Annex'));
    body = await previewIt();
    expect(body.refs.external[0].name).toBe('The Renamed Plaza Annex');

    // A vnum no listed area defines is a REAL warning now.
    rooms.rooms[0].exits[0].toVnum = 9999;
    body = await previewIt();
    expect(body.refs.external).toEqual([]);
    expect(body.refs.warnings.join('; ')).toContain('room 9999');
    expect(body.refs.warnings.join('; ')).toContain('any listed area');
  });
});
