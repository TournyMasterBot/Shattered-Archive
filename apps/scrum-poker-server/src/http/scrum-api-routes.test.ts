import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import type { ScrumPokerConfig } from '../config.js';
import { RoomStore } from '../room-store.js';
import { hostCookieName, secretCookieName } from './cookies.js';
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

async function startServer(store: RoomStore, roomTtlMs = 30 * 24 * HOUR): Promise<{ server: http.Server; url: string }> {
  const app = express();
  app.use(express.json());
  registerScrumApiRoutes(app, { store, now: () => T0, roomTtlMs });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

/** Pulls one cookie's `name=value` (attributes stripped) out of a fetch Response's Set-Cookie. */
function cookieValue(res: Response, name: string): string | undefined {
  const header = res.headers.get('set-cookie') ?? '';
  const match = header.split(';')[0];
  if (!match || !match.startsWith(`${name}=`)) return undefined;
  return decodeURIComponent(match.slice(name.length + 1));
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

  it('creates a room with defaults and mints the host token straight into an HttpOnly cookie', async () => {
    const res = await fetch(`${url}/api/scrum/rooms`, { method: 'POST' });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { roomId: string; settings: { deck: string[] } };
    expect(body.roomId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.settings.deck).toContain('13');
    // Never in the body: a script that could read it there would defeat the whole point of
    // moving it to an HttpOnly cookie.
    expect(JSON.stringify(body)).not.toContain('hostToken');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(hostCookieName(body.roomId));
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('Path=/');
    expect(cookieValue(res, hostCookieName(body.roomId))).toBeTruthy();
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

describe('POST /api/scrum/rooms/:id/join', () => {
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

  it('404s for an unknown room rather than minting anything', async () => {
    const res = await fetch(`${url}/api/scrum/rooms/00000001/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ada' }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('mints a participant and sets its secret straight into an HttpOnly cookie, never the body', async () => {
    const { room } = store.create(T0);
    const res = await fetch(`${url}/api/scrum/rooms/${room.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ada' }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { participantId: string; isHost: boolean };
    expect(body.participantId).toBeTruthy();
    expect(body.isHost).toBe(false);
    expect(JSON.stringify(body)).not.toContain('secret');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(secretCookieName(room.id));
    expect(setCookie).toContain('HttpOnly');
    const secret = cookieValue(res, secretCookieName(room.id));
    expect(secret).toBeTruthy();
    expect(store.get(room.id)?.participants).toEqual([
      expect.objectContaining({ id: body.participantId, secret, name: 'Ada' }),
    ]);
  });

  it('reattaches to the same participant when the secret cookie is replayed', async () => {
    const { room } = store.create(T0);
    const first = await fetch(`${url}/api/scrum/rooms/${room.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ada' }),
    });
    const firstBody = (await first.json()) as { participantId: string };
    const secret = cookieValue(first, secretCookieName(room.id));

    const second = await fetch(`${url}/api/scrum/rooms/${room.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${secretCookieName(room.id)}=${secret}` },
      body: JSON.stringify({ name: 'Ada' }),
    });
    const secondBody = (await second.json()) as { participantId: string };

    expect(secondBody.participantId).toBe(firstBody.participantId);
    expect(store.get(room.id)?.participants).toHaveLength(1);
  });

  it('reports isHost only when the host cookie matches this room’s token', async () => {
    const { room, hostToken } = store.create(T0);

    const withToken = await fetch(`${url}/api/scrum/rooms/${room.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${hostCookieName(room.id)}=${hostToken}` },
      body: JSON.stringify({ name: 'Ada' }),
    });
    expect(((await withToken.json()) as { isHost: boolean }).isHost).toBe(true);

    const withWrongToken = await fetch(`${url}/api/scrum/rooms/${room.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${hostCookieName(room.id)}=wrong` },
      body: JSON.stringify({ name: 'Grace' }),
    });
    expect(((await withWrongToken.json()) as { isHost: boolean }).isHost).toBe(false);
  });
});
