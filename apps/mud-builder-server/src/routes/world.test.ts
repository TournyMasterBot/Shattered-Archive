import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { AreaStore } from '../area-store.js';
import { registerWorldRoutes } from './world.js';
import type { WorldAreaSummary } from './world.js';

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

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
D0
~
~
0 0 5000
S
#0

#RESETS
M 0 101 1 100 1
S

#$
`;

// Over-subscribed limits (Phase 12b): mob 201 has TWO M resets but limit 1;
// object 202 is equipped by both mobs with limit 1. Demand 2 > limit 1.
const PRESSURE_AREA = `#AREA
pressure.are~
Pressure~
{ 1 50} Test  Pressure~
200 299

#MOBILES
#201
rare mob~
the rare mob~
A rare mob stands here.
~
He is in demand.
~
human~
1 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
#0

#OBJECTS
#202
rare blade~
a rare blade~
A rare blade lies here.~
steel~
weapon A AN
sword 1 6 slash 0
5 10 100 P
#0

#ROOMS
#200
Pressure Room~
A room under demand pressure.
~
0 0 1
S
#0

#RESETS
M 0 201 1 200 1
E 0 202 1 16
M 0 201 1 200 1
E 0 202 1 16
S

#$
`;

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-world-'));
  fs.writeFileSync(path.join(dir, 'area.lst'), 'tiny.are\npressure.are\nbroken.are\n$\n');
  fs.writeFileSync(path.join(dir, 'tiny.are'), TINY_AREA);
  fs.writeFileSync(path.join(dir, 'pressure.are'), PRESSURE_AREA);
  fs.writeFileSync(path.join(dir, 'broken.are'), '#AREA\nnot a real area file at all');

  const app = express();
  registerWorldRoutes(app, new AreaStore(dir, false));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/world (Phase 6)', () => {
  it('aggregates every area.lst entry with counts, warnings, and parse errors', async () => {
    const res = await fetch(`${base}/api/world`);
    expect(res.status).toBe(200);
    const { areas } = (await res.json()) as { areas: WorldAreaSummary[] };
    expect(areas.map((a) => a.file)).toEqual(['tiny.are', 'pressure.are', 'broken.are']);

    const tiny = areas[0];
    expect(tiny.name).toBe('Tiny');
    expect(tiny.minVnum).toBe(100);
    expect(tiny.maxVnum).toBe(199);
    expect(tiny.counts).toMatchObject({ rooms: 1, mobs: 1, resets: 1, objects: 0 });
    expect(tiny.errors).toEqual([]);
    // The exit to 5000 is outside tiny's range → a cross-area warning, not an error.
    expect(tiny.warnings.join('; ')).toContain('5000');

    const broken = areas[2];
    expect(broken.parseError).toBeTruthy();
    expect(broken.counts.rooms).toBe(0);
  });

  it('flags entities whose world-wide spawn demand exceeds their tightest limit (Phase 12b)', async () => {
    const res = await fetch(`${base}/api/world`);
    const { areas } = (await res.json()) as { areas: WorldAreaSummary[] };

    const tiny = areas[0];
    // tiny's guard: one M reset, limit 1 — demand does not exceed the limit.
    expect(tiny.limitPressure).toEqual([]);

    const pressured = areas[1];
    expect(pressured.limitPressure).toEqual([
      { kind: 'mob', vnum: 201, name: 'the rare mob', demand: 2, limit: 1 },
      { kind: 'object', vnum: 202, name: 'a rare blade', demand: 2, limit: 1 },
    ]);
  });
});
