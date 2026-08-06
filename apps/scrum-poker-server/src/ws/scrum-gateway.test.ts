import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ScrumServerMessage } from '@shatteredarchive/scrum-poker-core';

import type { ScrumPokerConfig } from '../config.js';
import { hostCookieName, secretCookieName } from '../http/cookies.js';
import { RoomStore } from '../room-store.js';
import { createGatewayContext, handleClientMessage, runSweep, type GatewayContext, type ScrumConn } from './scrum-gateway.js';

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function tempConfig(overrides: Partial<ScrumPokerConfig> = {}): ScrumPokerConfig {
  return {
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'scrum-poker-gw-')),
    idleTimeoutMs: HOUR,
    roomTtlMs: 30 * 24 * HOUR,
    emptyRoomTtlMs: 24 * HOUR,
    sweepIntervalMs: 60_000,
    maxRooms: 500,
    ...overrides,
  };
}

/** A connection with a recording `send` — no socket involved. */
function fakeConn(id: string): ScrumConn & { sent: ScrumServerMessage[] } {
  const sent: ScrumServerMessage[] = [];
  return {
    clientId: id,
    isHost: false,
    evicted: false,
    sent,
    send: (msg) => sent.push(msg),
  };
}

function lastState(conn: { sent: ScrumServerMessage[] }) {
  const states = conn.sent.filter((m): m is Extract<ScrumServerMessage, { type: 'state' }> => m.type === 'state');
  return states[states.length - 1]?.room;
}

function errors(conn: { sent: ScrumServerMessage[] }) {
  return conn.sent.filter((m): m is Extract<ScrumServerMessage, { type: 'error' }> => m.type === 'error').map((m) => m.message);
}

interface Harness {
  ctx: GatewayContext;
  store: RoomStore;
  roomId: string;
  hostToken: string;
  clock: { value: number };
}

function harness(config = tempConfig()): Harness {
  const store = new RoomStore(config);
  const clock = { value: T0 };
  const ctx = createGatewayContext(store, config, () => clock.value);
  const { room, hostToken } = store.create(T0);
  return { ctx, store, roomId: room.id, hostToken, clock };
}

/**
 * `hostToken`/`participantSecret` are no longer `join` message fields — they are cookies the
 * gateway reads off `conn.cookieHeader` (see scrum-gateway.ts). This helper keeps every
 * existing call site below unchanged by translating the same `opts` shape into a fake
 * `Cookie:` header on `conn` before sending the frame, exactly as a real browser's cookie jar
 * would present it on a WebSocket upgrade request.
 */
function join(h: Harness, conn: ScrumConn, name: string, opts: { hostToken?: string; participantSecret?: string } = {}) {
  const cookies: string[] = [];
  if (opts.hostToken !== undefined) cookies.push(`${hostCookieName(h.roomId)}=${opts.hostToken}`);
  if (opts.participantSecret !== undefined) cookies.push(`${secretCookieName(h.roomId)}=${opts.participantSecret}`);
  if (cookies.length > 0) conn.cookieHeader = cookies.join('; ');
  handleClientMessage(h.ctx, conn, { type: 'join', roomId: h.roomId, name });
}

/**
 * The secret the server settled this connection on. No longer readable off the wire (the
 * `joined` frame deliberately carries none — see protocol.ts) so this reads the ground truth
 * straight out of the store, keyed by the public participant id the frame DOES carry.
 */
function secretOf(h: Harness, conn: { participantId?: string }): string {
  const participant = h.store.get(h.roomId)?.participants.find((p) => p.id === conn.participantId);
  if (!participant) throw new Error('never joined');
  return participant.secret;
}

describe('join', () => {
  it('mints a participant id, acks, and broadcasts the roster', () => {
    const h = harness();
    const ada = fakeConn('ada');
    join(h, ada, 'Ada');

    const joined = ada.sent.find((m) => m.type === 'joined');
    expect(joined).toMatchObject({ roomId: h.roomId, isHost: false });
    expect(lastState(ada)?.participants.map((p) => p.name)).toEqual(['Ada']);
  });

  it('marks the connection as host only when the host token matches', () => {
    const h = harness();
    const host = fakeConn('host');
    const guest = fakeConn('guest');
    join(h, host, 'Ada', { hostToken: h.hostToken });
    join(h, guest, 'Grace', { hostToken: 'wrong' });

    expect(host.isHost).toBe(true);
    expect(guest.isHost).toBe(false);
  });

  it('rejects an unknown room code fatally', () => {
    const h = harness();
    const conn = fakeConn('c');
    handleClientMessage(h.ctx, conn, { type: 'join', roomId: '00000001', name: 'Ada' });

    expect(conn.sent[0]).toEqual({ type: 'error', code: 'no-room', message: 'No room with that code.', fatal: true });
  });

  it('re-attaches a replayed participant secret, keeping that person’s vote across a reconnect', () => {
    const h = harness();
    const first = fakeConn('first');
    join(h, first, 'Ada');
    handleClientMessage(h.ctx, first, { type: 'vote', card: '5' });

    const reconnected = fakeConn('second');
    join(h, reconnected, 'Ada', { participantSecret: secretOf(h, first) });

    expect(h.store.get(h.roomId)?.participants).toHaveLength(1);
    expect(lastState(reconnected)?.participants[0]).toMatchObject({ name: 'Ada', vote: '5' });
  });

  it('does not leak participant secrets to the room, and refuses a public id as one', () => {
    const h = harness();
    const ada = fakeConn('ada');
    const mallory = fakeConn('mallory');
    join(h, ada, 'Ada');
    handleClientMessage(h.ctx, ada, { type: 'vote', card: '5' });
    join(h, mallory, 'Mallory');

    // What Mallory can actually see of Ada: an id, and that she has voted — not the card.
    const adaRow = lastState(mallory)?.participants.find((p) => p.name === 'Ada');
    expect(adaRow).toMatchObject({ hasVoted: true, vote: null });
    expect(JSON.stringify(lastState(mallory))).not.toContain(secretOf(h, ada));

    // Replaying Ada's id as if it were her secret must land Mallory on her own row.
    const impostor = fakeConn('impostor');
    join(h, impostor, 'Ada', { participantSecret: adaRow!.id });

    expect(impostor.participantId).not.toBe(adaRow!.id);
    expect(lastState(impostor)?.participants.find((p) => p.id === adaRow!.id)?.vote).toBeNull();
    expect(h.store.get(h.roomId)?.participants.find((p) => p.id === adaRow!.id)?.vote).toBe('5');
  });
});

describe('voting and hiding', () => {
  it('withholds another participant’s vote until reveal, then shows it with stats', () => {
    const h = harness();
    const ada = fakeConn('ada');
    const grace = fakeConn('grace');
    join(h, ada, 'Ada');
    join(h, grace, 'Grace');

    handleClientMessage(h.ctx, ada, { type: 'vote', card: '5' });
    handleClientMessage(h.ctx, grace, { type: 'vote', card: '8' });

    const hidden = lastState(grace)!;
    expect(hidden.participants.find((p) => p.name === 'Ada')?.vote).toBeNull();
    expect(hidden.participants.find((p) => p.name === 'Ada')?.hasVoted).toBe(true);
    expect(hidden.participants.find((p) => p.name === 'Grace')?.vote).toBe('8');

    handleClientMessage(h.ctx, ada, { type: 'reveal' });

    const shown = lastState(grace)!;
    expect(shown.participants.map((p) => p.vote)).toEqual(['5', '8']);
    expect(shown.stats?.average).toBe(6.5);
  });

  it('rejects a card outside the deck', () => {
    const h = harness();
    const ada = fakeConn('ada');
    join(h, ada, 'Ada');
    handleClientMessage(h.ctx, ada, { type: 'vote', card: '7' });

    expect(errors(ada)).toContain('That card is not in this room’s deck.');
  });

  it('refuses any command from a connection that never joined', () => {
    const h = harness();
    const conn = fakeConn('c');
    handleClientMessage(h.ctx, conn, { type: 'vote', card: '5' });

    expect(errors(conn)).toEqual(['Join a room first.']);
  });
});

describe('reset and clear', () => {
  it('reset clears every vote and re-hides, keeping the roster', () => {
    const h = harness();
    const ada = fakeConn('ada');
    const grace = fakeConn('grace');
    join(h, ada, 'Ada');
    join(h, grace, 'Grace');
    handleClientMessage(h.ctx, ada, { type: 'vote', card: '5' });
    handleClientMessage(h.ctx, ada, { type: 'reveal' });
    handleClientMessage(h.ctx, grace, { type: 'resetEstimates' });

    const state = lastState(ada)!;
    expect(state.revealed).toBe(false);
    expect(state.participants.map((p) => p.hasVoted)).toEqual([false, false]);
    expect(state.participants).toHaveLength(2);
  });

  it('clear empties the roster and broadcasts it to everyone still connected', () => {
    const h = harness();
    const ada = fakeConn('ada');
    const grace = fakeConn('grace');
    join(h, ada, 'Ada');
    join(h, grace, 'Grace');
    handleClientMessage(h.ctx, ada, { type: 'clearUsers' });

    expect(lastState(grace)?.participants).toEqual([]);
    expect(lastState(ada)?.participants).toEqual([]);
  });

  it('blocks a guest from revealing when the organizer turned that permission off', () => {
    const h = harness();
    const host = fakeConn('host');
    const guest = fakeConn('guest');
    join(h, host, 'Ada', { hostToken: h.hostToken });
    join(h, guest, 'Grace');

    handleClientMessage(h.ctx, host, { type: 'updateSettings', settings: { allowGuestsToReveal: false } });
    handleClientMessage(h.ctx, guest, { type: 'reveal' });

    expect(errors(guest)).toContain('Only the room organizer can show or hide estimates here.');
    expect(lastState(guest)?.revealed).toBe(false);

    handleClientMessage(h.ctx, host, { type: 'reveal' });
    expect(lastState(host)?.revealed).toBe(true);
  });
});

describe('settings', () => {
  it('only the host may change them', () => {
    const h = harness();
    const guest = fakeConn('guest');
    join(h, guest, 'Grace');
    handleClientMessage(h.ctx, guest, { type: 'updateSettings', settings: { friendlyName: 'Hijacked' } });

    expect(errors(guest)).toContain('Only the room organizer can change room settings.');
    expect(h.store.get(h.roomId)?.settings.friendlyName).toBe('');
  });

  it('rejects an invalid deck and leaves the room untouched', () => {
    const h = harness();
    const host = fakeConn('host');
    join(h, host, 'Ada', { hostToken: h.hostToken });
    handleClientMessage(h.ctx, host, { type: 'updateSettings', settings: { deck: ['1'] } });

    expect(errors(host)).toContain('A deck needs at least 2 cards.');
    expect(h.store.get(h.roomId)?.settings.deck).toContain('13');
  });

  it('clears votes that a deck edit orphaned', () => {
    const h = harness();
    const host = fakeConn('host');
    join(h, host, 'Ada', { hostToken: h.hostToken });
    handleClientMessage(h.ctx, host, { type: 'vote', card: '13' });
    handleClientMessage(h.ctx, host, { type: 'updateSettings', settings: { deck: ['S', 'M', 'L'] } });

    expect(lastState(host)?.participants[0]?.vote).toBeNull();
    expect(lastState(host)?.settings.deck).toEqual(['S', 'M', 'L']);
  });
});

describe('ping', () => {
  it('answers without refreshing the idle clock, so an open tab still times out', () => {
    const h = harness();
    const ada = fakeConn('ada');
    join(h, ada, 'Ada');
    const joinedAt = h.store.get(h.roomId)!.participants[0]!.lastActiveAt;

    h.clock.value = T0 + 30 * 60 * 1000;
    handleClientMessage(h.ctx, ada, { type: 'ping' });

    expect(ada.sent.some((m) => m.type === 'pong')).toBe(true);
    expect(h.store.get(h.roomId)!.participants[0]!.lastActiveAt).toBe(joinedAt);
  });
});

describe('runSweep', () => {
  it('evicts an idle participant, tells them why, and broadcasts the shorter roster', () => {
    const h = harness();
    const ada = fakeConn('ada');
    const grace = fakeConn('grace');
    join(h, ada, 'Ada');
    join(h, grace, 'Grace');

    // Grace stays active; Ada goes quiet.
    h.clock.value = T0 + 59 * 60 * 1000;
    handleClientMessage(h.ctx, grace, { type: 'vote', card: '3' });

    h.clock.value = T0 + HOUR + 1;
    runSweep(h.ctx);

    expect(ada.evicted).toBe(true);
    expect(errors(ada)).toContain('You were removed after an hour of inactivity. Rejoin when you’re back.');
    // The CODE is what the client branches on — text is for humans only. Without a distinct
    // 'evicted' code the UI cannot tell this from a cleared room, and would auto-rejoin the
    // person the sweep just removed.
    expect(ada.sent.filter((m) => m.type === 'error').map((m) => m.code)).toContain('evicted');
    expect(lastState(grace)?.participants.map((p) => p.name)).toEqual(['Grace']);
    expect(errors(grace)).toEqual([]);
  });

  it('tells subscribers fatally when their room expires', () => {
    const config = tempConfig({ roomTtlMs: 2 * HOUR });
    const h = harness(config);
    const ada = fakeConn('ada');
    join(h, ada, 'Ada');

    h.clock.value = T0 + 3 * HOUR;
    runSweep(h.ctx);

    expect(ada.sent.at(-1)).toEqual({
      type: 'error',
      code: 'expired',
      message: 'This room expired and has been removed.',
      fatal: true,
    });
  });
});
