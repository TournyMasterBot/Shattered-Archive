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
});
