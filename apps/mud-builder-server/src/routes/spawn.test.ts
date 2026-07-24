import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { SimulateResetsResult } from '@shatteredarchive/merc-area';

import { AreaStore } from '../area-store.js';
import { registerSpawnRoutes } from './spawn.js';

const HOME_AREA = `#AREA
home.are~
Home~
{ 1 50} Test  Home~
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
A 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
#0

#OBJECTS
#102
sword test~
a test sword~
A test sword lies here.~
steel~
weapon A AN
sword 1 6 slash 0
5 10 100 P
#103
chest test~
a test chest~
A test chest lies here.~
wood~
container A AN
0 0 0 0 0
50 20 100 P
#0

#ROOMS
#110
Test Room~
A test room.
~
0 0 0
S
#0

#RESETS
M 0 101 1 110 1
E 0 102 -1 16
O 0 103 0 110
P 0 999 -1 103 1
S

#$
`;

const EQUIPMENT_AREA = `#AREA
equipment.are~
Equipment~
{ 1 50} Test  Equipment~
900 999

#OBJECTS
#999
gem test~
a cross-area gem~
A cross-area gem lies here.~
crystal~
treasure A AN
0 0 0 0 0
10 5 50 P
#0

#$
`;

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-spawn-'));
  fs.writeFileSync(path.join(dir, 'area.lst'), 'home.are\nequipment.are\nbroken.are\n$\n');
  fs.writeFileSync(path.join(dir, 'home.are'), HOME_AREA);
  fs.writeFileSync(path.join(dir, 'equipment.are'), EQUIPMENT_AREA);
  fs.writeFileSync(path.join(dir, 'broken.are'), '#AREA\nnot a real area file at all');

  const app = express();
  registerSpawnRoutes(app, new AreaStore(dir, false));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll((done) => {
  server.close(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    done();
  });
});

describe('GET /api/areas/:file/spawn', () => {
  it('runs the M/E/G-style chain and a cross-area P through the real world resolver', async () => {
    const res = await fetch(`${base}/api/areas/home.are/spawn`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SimulateResetsResult;
    expect(body.warnings).toEqual([]);
    expect(body.rooms).toHaveLength(1);
    const room = body.rooms[0];
    expect(room.room).toBe(110);
    // M + E: the guard spawns wielding the local sword.
    expect(room.mobs).toEqual([
      {
        vnum: 101,
        name: 'the test guard',
        count: 1,
        equipped: [{ vnum: 102, name: 'a test sword', contents: [], slot: 'wielded' }],
        carried: [],
      },
    ]);
    // O + cross-area P: the chest (local) holds the gem, whose TEMPLATE is
    // only defined in equipment.are — proving the route wired the real
    // worldVnumIndex resolver into simulateResets, not just a local lookup.
    expect(room.objects).toEqual([
      {
        vnum: 103,
        name: 'a test chest',
        contents: [{ vnum: 999, name: 'a cross-area gem', contents: [] }],
      },
    ]);
  });

  it('a broken NEIGHBOR file in area.lst does not break a healthy file\'s spawn preview', async () => {
    // home.are's spawn already succeeded above even though broken.are sits in
    // area.lst — AreaStore.worldVnumIndex swallows a neighbor parse failure
    // per-file. Assert it explicitly so a regression there is caught here too.
    const res = await fetch(`${base}/api/areas/home.are/spawn`);
    expect(res.status).toBe(200);
  });

  it('requesting spawn for the broken file itself 400s with the parse error, not a 500 or a crash', async () => {
    const res = await fetch(`${base}/api/areas/broken.are/spawn`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('404s an unlisted file and 400s an invalid file name', async () => {
    expect((await fetch(`${base}/api/areas/missing.are/spawn`)).status).toBe(404);
    expect((await fetch(`${base}/api/areas/${encodeURIComponent('..%2Fetc')}/spawn`)).status).toBe(400);
  });
});
