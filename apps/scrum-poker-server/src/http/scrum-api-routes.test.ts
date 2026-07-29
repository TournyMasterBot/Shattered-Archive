import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import type { ScrumPokerConfig } from '../config.js';
import { RoomStore } from '../room-store.js';
import { registerScrumApiRoutes } from './scrum-api-routes.js';

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function tempConfig(overrides: Partial<ScrumPokerConfig> = {}): ScrumPokerConfig {
  return {
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'scrum-poker-api-')),
    idleTimeoutMs: HOUR,
    roomTtlMs: 30 * 24 * HOUR,
    emptyRoomTtlMs: 24 * HOUR,
    sweepIntervalMs: 60_000,
    maxRooms: 500,
    ...overrides,
  };
}

async function startServer(store: RoomStore): Promise<{ server: http.Server; url: string }> {
  const app = express();
  app.use(express.json());
  registerScrumApiRoutes(app, { store, now: () => T0 });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe('POST /api/scrum/rooms', () => {
  let server: http.Server;
  let url: string;
  let store: RoomStore;

  beforeEach(async () => {
    store = new RoomStore(tempConfig());
    ({ server, url } = await startServer(store));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('creates a room with defaults and returns the host token once', async () => {
    const res = await fetch(`${url}/api/scrum/rooms`, { method: 'POST' });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { roomId: string; hostToken: string; settings: { deck: string[] } };
    expect(body.roomId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.hostToken).toBeTruthy();
    expect(body.settings.deck).toContain('13');
  });

  it('accepts a friendly name and a comma-separated deck', async () => {
    const res = await fetch(`${url}/api/scrum/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendlyName: '  Platform  Team ', deck: ' S , M , L ,, L ' }),
    });

    const body = (await res.json()) as { roomId: string; settings: { friendlyName: string; deck: string[] } };
    expect(body.settings.friendlyName).toBe('Platform Team');
    expect(body.settings.deck).toEqual(['S', 'M', 'L']);
    expect(store.get(body.roomId)?.settings.deck).toEqual(['S', 'M', 'L']);
  });

  it('rejects an invalid deck without leaving an orphan room behind', async () => {
    const res = await fetch(`${url}/api/scrum/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deck: 'onlyone' }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: 'A deck needs at least 2 cards.' });
    expect(store.size).toBe(0);
  });

  it('503s when the store is at its room limit', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store = new RoomStore(tempConfig({ maxRooms: 1 }));
    ({ server, url } = await startServer(store));

    expect((await fetch(`${url}/api/scrum/rooms`, { method: 'POST' })).status).toBe(201);
    const second = await fetch(`${url}/api/scrum/rooms`, { method: 'POST' });
    expect(second.status).toBe(503);
  });
});

describe('GET /api/scrum/rooms/:id', () => {
  let server: http.Server;
  let url: string;
  let store: RoomStore;

  beforeEach(async () => {
    store = new RoomStore(tempConfig());
    ({ server, url } = await startServer(store));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('404s for an unknown code', async () => {
    const res = await fetch(`${url}/api/scrum/rooms/00000001`);
    expect(res.status).toBe(404);
  });

  it('returns only the name and headcount — never the host token or who is in the room', async () => {
    const { room, hostToken } = store.create(T0, { friendlyName: 'Platform Team' });
    const res = await fetch(`${url}/api/scrum/rooms/${room.id}`);
    const text = await res.text();

    expect(JSON.parse(text)).toEqual({ id: room.id, friendlyName: 'Platform Team', participantCount: 0 });
    expect(text).not.toContain(hostToken);
  });
});
