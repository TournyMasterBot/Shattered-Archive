import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { AreaStore } from '../area-store.js';
import { registerMapRoutes } from './map.js';
import type { AreaMapResponse, WorldMapResponse } from './map.js';

const TINY_AREA = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
D0
~
~
0 0 101
D1
~
~
0 0 205
D2
~
~
0 0 999
S
#101
The Back Room~
Behind the test room.
~
0 0 1
D3
locked door~
door~
2 150 100
S
#0

#SCRIPTS
R 101 entry ~
echo A vortex!
warp 205
warp 100~
#0

#$
`;

const NEIGHBOR_AREA = `#AREA
neighbor.are~
Neighbor~
{ 1 50} Test  Neighbor~
200 299

#ROOMS
#205
Neighbor Landing~
The far side of the link.
~
0 0 1
S
#0

#$
`;

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-map-'));
  fs.writeFileSync(path.join(dir, 'area.lst'), 'tiny.are\nneighbor.are\nbroken.are\n$\n');
  fs.writeFileSync(path.join(dir, 'tiny.are'), TINY_AREA);
  fs.writeFileSync(path.join(dir, 'neighbor.are'), NEIGHBOR_AREA);
  fs.writeFileSync(path.join(dir, 'broken.are'), '#AREA\nnot a real area file at all');

  const app = express();
  registerMapRoutes(app, new AreaStore(dir, false));
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

describe('GET /api/map/:file', () => {
  it('returns rooms with internal, external, and dangling exits told apart', async () => {
    const res = await fetch(`${base}/api/map/tiny.are`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AreaMapResponse;
    expect(body.file).toBe('tiny.are');
    expect(body.name).toBe('Tiny');
    expect(body.minVnum).toBe(100);
    expect(body.maxVnum).toBe(199);
    expect(body.rooms.map((r) => r.vnum)).toEqual([100, 101]);

    const exits = body.rooms[0].exits;
    expect(exits).toHaveLength(3);
    // internal exit: target lives in this file, never external
    expect(exits[0]).toEqual({ door: 0, toVnum: 101, locks: 0 });
    // cross-area exit: resolved to the defining file + room name
    expect(exits[1]).toEqual({
      door: 1,
      toVnum: 205,
      locks: 0,
      external: { file: 'neighbor.are', name: 'Neighbor Landing' },
    });
    // dangling exit: no listed area defines 999 — no external flag
    expect(exits[2]).toEqual({ door: 2, toVnum: 999, locks: 0 });
  });

  it('carries lock states and room-script warps (Phase 12b)', async () => {
    const res = await fetch(`${base}/api/map/tiny.are`);
    const body = (await res.json()) as AreaMapResponse;
    const back = body.rooms[1];
    // pickproof door (locks 2, key 150) back west to the test room
    expect(back.exits[0]).toEqual({ door: 3, toVnum: 100, locks: 2 });
    // script warps: one cross-area (resolved), one internal
    expect(back.warps).toEqual([
      { toVnum: 205, external: { file: 'neighbor.are', name: 'Neighbor Landing' } },
      { toVnum: 100 },
    ]);
    // rooms without warps omit the field entirely
    expect(body.rooms[0].warps).toBeUndefined();
  });

  it('404s an unlisted file and 400s an invalid name', async () => {
    expect((await fetch(`${base}/api/map/missing.are`)).status).toBe(404);
    expect((await fetch(`${base}/api/map/${encodeURIComponent('..%2Fetc')}`)).status).toBe(400);
  });
});

describe('GET /api/map', () => {
  it('aggregates areas and directional cross-area links, tolerating broken files', async () => {
    const res = await fetch(`${base}/api/map`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorldMapResponse;

    expect(body.areas.map((a) => a.file)).toEqual(['tiny.are', 'neighbor.are', 'broken.are']);
    const tiny = body.areas[0];
    expect(tiny.rooms).toBe(2);
    expect(tiny.name).toBe('Tiny');
    const broken = body.areas[2];
    expect(broken.rooms).toBe(0);
    expect(broken.parseError).toBeTruthy();

    expect(body.links).toHaveLength(1);
    const link = body.links[0];
    expect(link.from).toBe('tiny.are');
    expect(link.to).toBe('neighbor.are');
    expect(link.count).toBe(1);
    expect(link.exits).toEqual([{ fromVnum: 100, door: 1, toVnum: 205, toName: 'Neighbor Landing' }]);
  });
});
