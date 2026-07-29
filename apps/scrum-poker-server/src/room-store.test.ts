import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { joinRoom } from '@shatteredarchive/scrum-poker-core';

import type { ScrumPokerConfig } from './config.js';
import { RoomStore, normalizeStoredRoom } from './room-store.js';

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function tempConfig(overrides: Partial<ScrumPokerConfig> = {}): ScrumPokerConfig {
  return {
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'scrum-poker-store-')),
    idleTimeoutMs: HOUR,
    roomTtlMs: 30 * 24 * HOUR,
    emptyRoomTtlMs: 24 * HOUR,
    sweepIntervalMs: 60_000,
    maxRooms: 500,
    ...overrides,
  };
}

/** Writes a rooms.json containing exactly `rooms`, and returns the config pointing at it. */
function storeWith(rooms: unknown[], overrides: Partial<ScrumPokerConfig> = {}): ScrumPokerConfig {
  const config = tempConfig(overrides);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(path.join(config.dataDir, 'rooms.json'), JSON.stringify({ version: 1, rooms }), 'utf8');
  return config;
}

describe('RoomStore', () => {
  it('mints UUID ids and a host token that is not the room id', () => {
    const store = new RoomStore(tempConfig());
    const { room, hostToken } = store.create(T0);

    expect(room.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(hostToken).toEqual(room.hostToken);
    expect(hostToken.length).toBeGreaterThan(20);
    // The id is public (it's in the URL); the host token is not. They must never coincide.
    expect(hostToken).not.toEqual(room.id);
  });

  it('hands back distinct ids across many rooms', () => {
    const store = new RoomStore(tempConfig());
    const ids = new Set(Array.from({ length: 200 }, () => store.create(T0).room.id));
    expect(ids.size).toBe(200);
  });

  it('still loads rooms whose stored id predates the UUID switch', () => {
    const config = tempConfig();
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(config.dataDir, 'rooms.json'),
      JSON.stringify({
        version: 1,
        rooms: [
          {
            id: '58154894',
            hostToken: 'legacy-token',
            createdAt: T0,
            lastActiveAt: T0,
            revealed: false,
            participants: [],
            settings: { friendlyName: 'Legacy', deck: ['1', '2'], hideUntilRevealed: true },
          },
        ],
      }),
      'utf8',
    );

    expect(new RoomStore(config).get('58154894')?.settings.friendlyName).toBe('Legacy');
  });

  it('refuses to exceed maxRooms rather than growing without bound', () => {
    const store = new RoomStore(tempConfig({ maxRooms: 2 }));
    store.create(T0);
    store.create(T0);
    expect(() => store.create(T0)).toThrow('Room limit reached');
  });

  it('round-trips rooms through disk, including votes', () => {
    const config = tempConfig();
    const store = new RoomStore(config);
    const { room } = store.create(T0, { friendlyName: 'Platform Team' });
    const joined = joinRoom(room, { participantId: 'p0', participantSecret: 's0', name: 'Ada', now: T0 });
    if ('error' in joined) throw new Error(joined.error);
    store.save({ ...joined.room, participants: joined.room.participants.map((p) => ({ ...p, vote: '5' })) });
    store.flush();

    const reloaded = new RoomStore(config);
    const back = reloaded.get(room.id);
    expect(back?.settings.friendlyName).toBe('Platform Team');
    expect(back?.participants[0]).toMatchObject({ name: 'Ada', vote: '5' });
  });

  it('quarantines an unreadable rooms file and still boots empty', () => {
    const config = tempConfig();
    fs.mkdirSync(config.dataDir, { recursive: true });
    const file = path.join(config.dataDir, 'rooms.json');
    fs.writeFileSync(file, '{ this is not json', 'utf8');

    const warnings: string[] = [];
    const store = new RoomStore(config, (message) => warnings.push(message));

    expect(store.size).toBe(0);
    expect(warnings[0]).toContain('unreadable');
    expect(fs.readdirSync(config.dataDir).some((f) => f.includes('corrupt'))).toBe(true);
  });

  it('sweeps idle participants and reports which rooms changed', () => {
    const store = new RoomStore(tempConfig());
    const { room } = store.create(T0);
    const joined = joinRoom(room, { participantId: 'p0', participantSecret: 's0', name: 'Ada', now: T0 });
    if ('error' in joined) throw new Error(joined.error);
    store.save(joined.room);

    expect(store.sweep(T0 + 59 * 60 * 1000)).toEqual({ changed: [], removed: [] });

    const result = store.sweep(T0 + HOUR + 1);
    expect(result.changed).toEqual([room.id]);
    expect(store.get(room.id)?.participants).toEqual([]);
  });

  it('boots past a room record whose stored settings are malformed, keeping the good ones', () => {
    // Regression: a `deck: null` here used to throw a TypeError out of applySettingsPatch,
    // straight through the constructor, and the service refused to start. A bad record must
    // degrade to "that room is gone", never to "the server is down".
    const good = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      hostToken: 'h',
      createdAt: T0,
      lastActiveAt: T0,
      revealed: false,
      participants: [],
      settings: { friendlyName: 'Fine', deck: ['1', '2'], hideUntilRevealed: true },
    };
    const malformed = [
      { ...good, id: 'bad-deck-null', settings: { ...good.settings, deck: null } },
      { ...good, id: 'bad-deck-string', settings: { ...good.settings, deck: '1,2,3' } },
      { ...good, id: 'bad-deck-mixed', settings: { ...good.settings, deck: ['1', 7] } },
      { ...good, id: 'bad-name', settings: { ...good.settings, friendlyName: null } },
      { ...good, id: 'bad-flag', settings: { ...good.settings, hideUntilRevealed: 'yes' } },
    ];

    const warnings: string[] = [];
    let store: RoomStore | undefined;
    expect(() => {
      store = new RoomStore(storeWith([...malformed, good]), (m) => warnings.push(m));
    }).not.toThrow();

    expect(store!.size).toBe(1);
    expect(store!.get(good.id)?.settings.friendlyName).toBe('Fine');
    for (const bad of malformed) expect(store!.get(bad.id)).toBeUndefined();
    expect(warnings.join(' ')).toContain('unreadable room records');
  });

  it('drops stored participants that predate split identity, and unknown settings keys', () => {
    const stored = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      hostToken: 'h',
      createdAt: T0,
      lastActiveAt: T0 + 1,
      revealed: false,
      participants: [
        // No `secret`: written by a build where the public id was the re-attach credential.
        { id: 'old', name: 'Ada', vote: '5', joinedAt: T0, lastActiveAt: T0 },
        { id: 'new', secret: 's1', name: 'Grace', vote: '8', joinedAt: T0, lastActiveAt: T0 },
      ],
      settings: { friendlyName: 'Fine', deck: ['5', '8'], hideUntilRevealed: true, injected: 'nope' },
    };

    const store = new RoomStore(storeWith([stored]));
    const back = store.get(stored.id);

    expect(back?.participants.map((p) => p.name)).toEqual(['Grace']);
    expect(back?.settings).not.toHaveProperty('injected');
    // The room itself survives — only the unusable row and the stray key are discarded.
    expect(back?.settings.friendlyName).toBe('Fine');
  });

  it('reclaims rooms nobody ever joined, but not a room a team has used', () => {
    const config = tempConfig({ emptyRoomTtlMs: 2 * HOUR });
    const store = new RoomStore(config);

    const abandoned = store.create(T0).room;
    const used = store.create(T0).room;
    // One join is enough to move lastActiveAt off createdAt permanently.
    const joined = joinRoom(used, { participantId: 'p0', participantSecret: 's0', name: 'Ada', now: T0 + 1000 });
    if ('error' in joined) throw new Error(joined.error);
    store.save(joined.room);

    const result = store.sweep(T0 + 3 * HOUR);

    expect(result.removed).toEqual([abandoned.id]);
    expect(store.get(used.id)).toBeDefined();
  });

  it('keeps a used room even after everyone has idled out of its roster', () => {
    const config = tempConfig({ emptyRoomTtlMs: 2 * HOUR });
    const store = new RoomStore(config);
    const { room } = store.create(T0);
    const joined = joinRoom(room, { participantId: 'p0', participantSecret: 's0', name: 'Ada', now: T0 + 1000 });
    if ('error' in joined) throw new Error(joined.error);
    store.save(joined.room);

    // Ada idles out first, leaving zero participants — the room must NOT then look abandoned.
    store.sweep(T0 + HOUR + 2000);
    expect(store.get(room.id)?.participants).toEqual([]);

    expect(store.sweep(T0 + 5 * HOUR).removed).toEqual([]);
    expect(store.get(room.id)).toBeDefined();
  });

  it('removes rooms past their TTL', () => {
    const store = new RoomStore(tempConfig({ roomTtlMs: 2 * HOUR }));
    const { room } = store.create(T0);

    const result = store.sweep(T0 + 3 * HOUR);
    expect(result.removed).toEqual([room.id]);
    expect(store.get(room.id)).toBeUndefined();
  });
});

describe('normalizeStoredRoom', () => {
  it('rejects records missing required fields', () => {
    expect(normalizeStoredRoom(null)).toBeUndefined();
    expect(normalizeStoredRoom({ id: '1' })).toBeUndefined();
    expect(normalizeStoredRoom({ id: '1', hostToken: 'h', createdAt: 0, lastActiveAt: 0, participants: [] })).toBeUndefined();
  });

  it('drops a room whose stored settings no longer pass validation', () => {
    const raw = {
      id: '12345678',
      hostToken: 'h',
      createdAt: T0,
      lastActiveAt: T0,
      revealed: false,
      participants: [],
      settings: { friendlyName: '', deck: ['1'], hideUntilRevealed: true },
    };
    expect(normalizeStoredRoom(raw)).toBeUndefined();
  });

  it('drops malformed participant rows but keeps the good ones', () => {
    const raw = {
      id: '12345678',
      hostToken: 'h',
      createdAt: T0,
      lastActiveAt: T0,
      revealed: true,
      participants: [
        { id: 'p0', secret: 's0', name: 'Ada', vote: '5', joinedAt: T0, lastActiveAt: T0 },
        { id: 'p1', secret: 's1', name: 'Grace', vote: 7, joinedAt: T0, lastActiveAt: T0 },
        'nonsense',
      ],
      settings: { friendlyName: 'Team', deck: ['1', '2'], hideUntilRevealed: true },
    };
    const room = normalizeStoredRoom(raw);
    expect(room?.participants.map((p) => p.name)).toEqual(['Ada']);
    expect(room?.revealed).toBe(true);
  });
});
