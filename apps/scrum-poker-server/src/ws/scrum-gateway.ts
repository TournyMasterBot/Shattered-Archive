import type * as http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

import {
  SCRUM_PROTOCOL_VERSION,
  applySettingsPatch,
  castVote,
  clearParticipants,
  joinRoom,
  parseScrumClientMessage,
  renameParticipant,
  resetEstimates,
  setRevealed,
  toRoomView,
  touchParticipant,
} from '@shatteredarchive/scrum-poker-core';
import type { Room, ScrumClientMessage, ScrumServerMessage } from '@shatteredarchive/scrum-poker-core';

import type { ScrumPokerConfig } from '../config.js';
import { hostCookieName, readCookieValue, secretCookieName } from '../http/cookies.js';
import { RoomStore } from '../room-store.js';

/**
 * The `/ws/scrum` room gateway.
 *
 * Every mutation lands here, goes through a core reducer, is saved, and is re-broadcast to
 * the room. Broadcasts are projected PER CONNECTION (`toRoomView(room, viewerId)`) rather
 * than built once and fanned out, because each viewer must see their own hidden vote and
 * nobody else's — building one shared payload would either leak every vote or blank out the
 * viewer's own card.
 *
 * The per-message logic is factored into `handleClientMessage` so it is unit-testable with a
 * fake `send` and no socket, the same arrangement as kingdom-tactics-server's kt-gateway.
 */

/**
 * Largest frame the gateway will accept, overriding `ws`'s 100 MB default.
 *
 * Every legal frame here is tiny — the biggest is a settings update carrying a 20-card deck
 * of ≤6-character cards. 16 KB is orders of magnitude of headroom, while the default let any
 * unauthenticated connection push 100 MB through `toString('utf-8')` and `JSON.parse` before
 * a single field was inspected.
 */
const MAX_FRAME_BYTES = 16 * 1024;

/** One connected browser tab. `send` targets THIS connection; the gateway supplies it. */
export interface ScrumConn {
  readonly clientId: string;
  roomId?: string;
  participantId?: string;
  isHost: boolean;
  /** Set when the idle sweeper removed this person while their socket stayed open. */
  evicted: boolean;
  /**
   * The raw `Cookie:` header from the WebSocket upgrade request, captured once at connection
   * time. `join` reads `__Host-sp_secret_<roomId>`/`__Host-sp_host_<roomId>` out of this —
   * never from the message itself — since roomId (and so which cookie name to look for) isn't
   * known until the first `join` frame arrives. Undefined for a connection with no cookies at
   * all (cookies disabled, or a genuinely first-ever visit with no prior HTTP mint).
   *
   * FROZEN for the life of the connection — there is no way to update it mid-socket, since a
   * WebSocket carries no further Cookie header after the upgrade handshake. A `join` frame sent
   * on an already-open socket therefore ALWAYS reads whatever cookie was present at connect
   * time, however stale — which is exactly why the client (useScrumRoom.ts) never sends a bare
   * `join` frame on an open socket to request a fresh mint (post-clear auto-rejoin,
   * post-eviction "Rejoin"): doing so mints a real participant here, but that row's secret can
   * never reach this field, so it is invisible to every future reattach until the socket itself
   * cycles. Two client-side incidents came out of this constraint (2026-08-06: an HTTP mint
   * ahead of an already-open socket's `join` raced this frozen field and cloned the clicker
   * every time; 2026-08-12: the WS-only fallback that replaced it left a fresh mint's secret
   * permanently unreachable, orphaning a ghost row on every clear/eviction cycle). The fix for
   * both lives entirely on the client (`forceFreshRejoin` in useScrumRoom.ts, which closes and
   * reopens the socket so the mint-before-connect handshake runs against a fresh connection) —
   * this field's freeze is a hard constraint of the WebSocket protocol, not a bug to fix here.
   */
  cookieHeader?: string;
  send(msg: ScrumServerMessage): void;
}

export interface GatewayContext {
  readonly store: RoomStore;
  readonly config: ScrumPokerConfig;
  /** Injected so tests can drive time; production passes `Date.now`. */
  readonly now: () => number;
  /** Every live connection, keyed by roomId — the broadcast fan-out set. */
  readonly subscribers: Map<string, Set<ScrumConn>>;
}

export function createGatewayContext(store: RoomStore, config: ScrumPokerConfig, now: () => number = Date.now): GatewayContext {
  return { store, config, now, subscribers: new Map() };
}

/** Re-projects `room` for each subscriber and sends it. The only way state reaches clients. */
export function broadcastRoom(ctx: GatewayContext, room: Room): void {
  for (const conn of ctx.subscribers.get(room.id) ?? []) {
    conn.send({ type: 'state', room: toRoomView(room, conn.participantId ?? null) });
  }
}

function subscribe(ctx: GatewayContext, roomId: string, conn: ScrumConn): void {
  let set = ctx.subscribers.get(roomId);
  if (!set) {
    set = new Set();
    ctx.subscribers.set(roomId, set);
  }
  set.add(conn);
}

function unsubscribe(ctx: GatewayContext, roomId: string, conn: ScrumConn): void {
  const set = ctx.subscribers.get(roomId);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) ctx.subscribers.delete(roomId);
}

/**
 * Resolves the room + participant a frame is acting on, or sends the client the reason it
 * cannot. Every command below `join` funnels through this, so "you never joined", "that room
 * is gone", and "you were swept" each produce one consistent error rather than three.
 */
function requireMembership(ctx: GatewayContext, conn: ScrumConn): { room: Room; participantId: string } | undefined {
  if (!conn.roomId || !conn.participantId) {
    conn.send({ type: 'error', code: 'not-joined', message: 'Join a room first.' });
    return undefined;
  }
  const room = ctx.store.get(conn.roomId);
  if (!room) {
    conn.send({ type: 'error', code: 'expired', message: 'This room no longer exists.', fatal: true });
    return undefined;
  }
  if (!room.participants.some((p) => p.id === conn.participantId)) {
    conn.send({ type: 'error', code: 'evicted', message: 'You are no longer in this room — rejoin to continue.' });
    return undefined;
  }
  return { room, participantId: conn.participantId };
}

/** Host-or-permitted check for the three shared controls. */
function mayRun(conn: ScrumConn, room: Room, permission: 'reveal' | 'reset' | 'clear'): boolean {
  if (conn.isHost) return true;
  switch (permission) {
    case 'reveal':
      return room.settings.allowGuestsToReveal;
    case 'reset':
      return room.settings.allowGuestsToReset;
    case 'clear':
      return room.settings.allowGuestsToClearUsers;
  }
}

/** Applies one validated frame. Returns nothing; all output goes through `conn.send`/broadcast. */
export function handleClientMessage(ctx: GatewayContext, conn: ScrumConn, msg: ScrumClientMessage): void {
  const now = ctx.now();

  if (msg.type === 'join') {
    const room = ctx.store.get(msg.roomId);
    if (!room) {
      conn.send({ type: 'error', code: 'no-room', message: 'No room with that code.', fatal: true });
      return;
    }

    // A replayed SECRET — read from the `__Host-sp_secret_<roomId>` cookie the browser
    // attached automatically on this connection's upgrade request, never from the message
    // itself — re-attaches to the existing row (keeping that person's vote through a refresh);
    // anything else becomes a new participant on the freshly minted id+secret below. The
    // typical case already minted this same secret moments earlier via
    // `POST /api/scrum/rooms/:id/join`, which is what got it into the cookie the browser is
    // now replaying; the fresh mint here is the fallback for a connection with no such cookie
    // (cookies disabled), which degrades to "no reconnect convenience", never a broken join.
    // The public participant id is never accepted as identity either: it is in every roster
    // broadcast, so honouring it would let any member rejoin as any other.
    const replayedSecret = readCookieValue(conn.cookieHeader, secretCookieName(msg.roomId));
    const result = joinRoom(room, {
      participantId: RoomStore.newParticipantId(),
      participantSecret: RoomStore.newParticipantSecret(),
      replayedSecret,
      name: msg.name,
      now,
    });
    if ('error' in result) {
      conn.send({ type: 'error', code: result.error === 'This room is full.' ? 'room-full' : 'invalid', message: result.error });
      return;
    }
    const { id: participantId } = result.participant;

    if (conn.roomId && conn.roomId !== msg.roomId) unsubscribe(ctx, conn.roomId, conn);
    conn.roomId = msg.roomId;
    conn.participantId = participantId;
    const hostToken = readCookieValue(conn.cookieHeader, hostCookieName(msg.roomId));
    conn.isHost = hostToken !== undefined && hostToken === room.hostToken;
    conn.evicted = false;
    subscribe(ctx, msg.roomId, conn);

    ctx.store.save(result.room);
    // No secret in this ack: the credential that reattaches this browser to this row is
    // already sitting in its cookie jar, never in a payload page JS could read.
    conn.send({
      type: 'joined',
      roomId: msg.roomId,
      participantId,
      isHost: conn.isHost,
      protocolVersion: SCRUM_PROTOCOL_VERSION,
    });
    broadcastRoom(ctx, result.room);
    return;
  }

  if (msg.type === 'leave') {
    if (conn.roomId) unsubscribe(ctx, conn.roomId, conn);
    conn.roomId = undefined;
    conn.participantId = undefined;
    conn.isHost = false;
    return;
  }

  if (msg.type === 'ping') {
    // Deliberately does NOT bump activity: the idle timer measures interaction, not an open
    // tab, so a heartbeat that refreshed it would make the one-hour sweep unreachable.
    conn.send({ type: 'pong' });
    return;
  }

  const membership = requireMembership(ctx, conn);
  if (!membership) return;
  const { room, participantId } = membership;

  switch (msg.type) {
    case 'rename': {
      const next = renameParticipant(room, participantId, msg.name, now);
      if ('error' in next) {
        conn.send({ type: 'error', code: 'invalid', message: next.error });
        return;
      }
      ctx.store.save(next);
      broadcastRoom(ctx, next);
      return;
    }

    case 'vote': {
      const next = castVote(room, participantId, msg.card, now);
      if ('error' in next) {
        conn.send({ type: 'error', code: 'invalid', message: next.error });
        return;
      }
      ctx.store.save(next);
      broadcastRoom(ctx, next);
      return;
    }

    case 'reveal':
    case 'hide': {
      if (!mayRun(conn, room, 'reveal')) {
        conn.send({ type: 'error', code: 'forbidden', message: 'Only the room organizer can show or hide estimates here.' });
        return;
      }
      const next = touchParticipant(setRevealed(room, msg.type === 'reveal', now), participantId, now);
      ctx.store.save(next);
      broadcastRoom(ctx, next);
      return;
    }

    case 'resetEstimates': {
      if (!mayRun(conn, room, 'reset')) {
        conn.send({ type: 'error', code: 'forbidden', message: 'Only the room organizer can reset estimates here.' });
        return;
      }
      const next = touchParticipant(resetEstimates(room, now), participantId, now);
      ctx.store.save(next);
      broadcastRoom(ctx, next);
      return;
    }

    case 'clearUsers': {
      if (!mayRun(conn, room, 'clear')) {
        conn.send({ type: 'error', code: 'forbidden', message: 'Only the room organizer can clear users here.' });
        return;
      }
      const next = clearParticipants(room, now);
      ctx.store.save(next);
      // Everyone including the caller is now off the roster; their clients re-join on the
      // next frame. Nobody is disconnected — "clear" resets the list, it does not kick.
      broadcastRoom(ctx, next);
      return;
    }

    case 'updateSettings': {
      if (!conn.isHost) {
        conn.send({ type: 'error', code: 'forbidden', message: 'Only the room organizer can change room settings.' });
        return;
      }
      const patched = applySettingsPatch(room.settings, msg.settings);
      if ('error' in patched) {
        conn.send({ type: 'error', code: 'invalid', message: patched.error });
        return;
      }
      // A deck edit can orphan votes that are no longer in the deck — drop those rather than
      // leaving a participant holding a card the UI can no longer render or tally.
      const deck = patched.settings.deck;
      const participants = room.participants.map((p) => (p.vote !== null && !deck.includes(p.vote) ? { ...p, vote: null } : p));
      const next = touchParticipant({ ...room, settings: patched.settings, participants, lastActiveAt: now }, participantId, now);
      ctx.store.save(next);
      broadcastRoom(ctx, next);
      return;
    }
  }
}

/**
 * Runs one sweep pass: drops idle participants and expired rooms, tells anyone who was
 * removed why, and re-broadcasts the rooms that changed.
 *
 * The eviction notice matters — without it a client cannot tell "the organizer cleared the
 * room" (auto-rejoin) from "you went quiet for an hour" (ask before rejoining), and would
 * silently re-add the idle person it just removed.
 */
export function runSweep(ctx: GatewayContext): void {
  const { changed, removed } = ctx.store.sweep(ctx.now());

  for (const roomId of changed) {
    const room = ctx.store.get(roomId);
    if (!room) continue;
    for (const conn of ctx.subscribers.get(roomId) ?? []) {
      if (conn.participantId && !room.participants.some((p) => p.id === conn.participantId)) {
        conn.evicted = true;
        conn.send({
          type: 'error',
          code: 'evicted',
          message: 'You were removed after an hour of inactivity. Rejoin when you’re back.',
        });
      }
    }
    broadcastRoom(ctx, room);
  }

  for (const roomId of removed) {
    for (const conn of ctx.subscribers.get(roomId) ?? []) {
      conn.send({ type: 'error', code: 'expired', message: 'This room expired and has been removed.', fatal: true });
    }
    ctx.subscribers.delete(roomId);
  }
}

/** Mounts `/ws/scrum` on an existing HTTP server and starts the idle sweeper. */
export function setupScrumWebSocketGateway(
  server: http.Server,
  opts: {
    store: RoomStore;
    config: ScrumPokerConfig;
    now?: () => number;
    onError?: (err: unknown) => void;
  },
): { wss: WebSocketServer; ctx: GatewayContext; stop: () => void } {
  const ctx = createGatewayContext(opts.store, opts.config, opts.now ?? Date.now);
  const wss = new WebSocketServer({ server, path: '/ws/scrum', maxPayload: MAX_FRAME_BYTES });
  let nextClientId = 1;

  wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
    const conn: ScrumConn = {
      clientId: `c${nextClientId++}`,
      isHost: false,
      evicted: false,
      // Captured once, here: by the time a `join` frame arrives and we know which room's
      // cookie to look for, the upgrade request itself is long gone.
      cookieHeader: request.headers.cookie,
      send: (msg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
    };

    ws.on('message', (raw: Buffer) => {
      const msg = parseScrumClientMessage(raw.toString('utf-8'));
      if (!msg) {
        conn.send({ type: 'error', code: 'invalid', message: 'Unrecognized message.' });
        return;
      }
      try {
        handleClientMessage(ctx, conn, msg);
      } catch (err) {
        // A thrown reducer must never take the socket (or the process) down.
        opts.onError?.(err);
        conn.send({ type: 'error', code: 'internal', message: 'Something went wrong handling that action.' });
      }
    });

    ws.on('close', () => {
      // The participant row deliberately SURVIVES a disconnect: a refresh or a dropped wifi
      // should not wipe someone's vote mid-round. The idle sweeper is what eventually
      // removes them, which is exactly the "times out after an hour" behaviour.
      if (conn.roomId) unsubscribe(ctx, conn.roomId, conn);
    });

    ws.on('error', (err) => opts.onError?.(err));
  });

  const sweeper = setInterval(() => {
    try {
      runSweep(ctx);
    } catch (err) {
      opts.onError?.(err);
    }
  }, opts.config.sweepIntervalMs);
  sweeper.unref?.();

  return {
    wss,
    ctx,
    stop: () => {
      clearInterval(sweeper);
      wss.close();
    },
  };
}
