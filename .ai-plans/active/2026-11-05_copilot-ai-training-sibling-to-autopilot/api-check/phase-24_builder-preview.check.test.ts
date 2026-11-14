/**
 * Phase 24 API check (Copilot plan 2026-11-05): the Builder's real import-preview route, with a real HTTP request, on a fresh
 * Express app over an empty temporary area directory, with the .are text the Maps export makes from a 12-room fixture.
 * The commit route is never called. A scratch file: not part of the Builder's tests.
 */
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';

import { registerRoutes } from './app.js';
import { getMudBuilderConfig } from './config.js';
import { exportMerc } from '../../../services/shattered-maps-core/src/index.js';
import type { MapFile, Link, Room, Direction } from '../../../services/shattered-maps-core/src/index.js';

function twelveRooms(): MapFile {
  const rooms: Room[] = [];
  const links: Link[] = [];
  const dirs: Direction[] = ['E', 'W'];
  for (let i = 1; i <= 12; i += 1) {
    const exits: Partial<Record<Direction, string>> = {};
    if (i < 12) {
      links.push({ id: `e${i}`, from: `r${i}`, dir: 'E', to: `r${i + 1}`, state: 'confirmed', confidence: 0.95, offPage: false, traversals: 2, reverse: true });
      exits.E = `e${i}`;
    }
    if (i > 1) {
      links.push({ id: `w${i}`, from: `r${i}`, dir: 'W', to: `r${i - 1}`, state: 'confirmed', confidence: 0.95, offPage: false, traversals: 2, reverse: true });
      exits.W = `w${i}`;
    }
    rooms.push({ id: `r${i}`, title: `Mill Lane ${i}`, sector: i % 3 === 0 ? 'field' : 'city', description: `A rutted lane, number ${i}.`, exits, coords: { x: i, y: 0 }, sources: [{ kind: 'manual' }] });
  }
  void dirs;
  return { version: 1, continents: [{ id: 'c', name: 'Check Land', areas: [{ id: 'mill-lane', name: 'Mill Lane', placement: null, subzones: [{ id: 'mill-main', name: 'Main', kind: 'consistent', rooms }] }] }], links };
}

it('the Builder preview accepts the 12-room export with no errors and counts the rooms', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maps-export-check-'));
  fs.mkdirSync(path.join(dir, 'area'));
  fs.writeFileSync(path.join(dir, 'area', 'area.lst'), '$\n');
  const app = express();
  registerRoutes(app, getMudBuilderConfig({ MERC_MUD_PATH: dir, MERC_AREA_DIR: "area" } as NodeJS.ProcessEnv));
  const server = await new Promise<import('http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const exported = exportMerc(twelveRooms(), { level: 'area', id: 'mill-lane', fileName: 'mill_lane.are', vnumRange: { min: 30000, max: 30099 } });
    expect(exported.report.errors).toEqual([]);
    const res = await fetch(`${base}/api/import/area/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: 'mill_lane.are', text: exported.text }),
    });
    const body = (await res.json()) as { report: { errors: string[]; warnings: string[]; normalizedText: string | null; summary: Record<string, number> | null; exists: boolean; registered: boolean } };
    // eslint-disable-next-line no-console
    console.log(`PREVIEW status=${res.status} errors=${JSON.stringify(body.report.errors)} warnings=${JSON.stringify(body.report.warnings)} summary=${JSON.stringify(body.report.summary)} exists=${body.report.exists} registered=${body.report.registered} sameText=${body.report.normalizedText === exported.text}`);
    expect(res.status).toBe(200);
    expect(body.report.errors).toEqual([]);
    expect(body.report.summary).toEqual({ rooms: 12 });
    expect(body.report.normalizedText).toBe(exported.text);
    expect(fs.readdirSync(path.join(dir, "area"))).toEqual(["area.lst"]); // the preview wrote nothing
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
