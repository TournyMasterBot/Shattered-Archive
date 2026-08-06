import { useCallback, useEffect, useRef, useState } from 'react';

import { parseScrumServerMessage } from './parse-server-message.js';
import type { RoomSettingsPatch, RoomView, ScrumClientMessage } from '@shatteredarchive/scrum-poker-core';
import { api } from '../api/client.js';
import { storage } from '../storage.js';

/**
 * The room's live connection: one websocket to `/ws/scrum`, the last `RoomView` the server
 * sent, and the action senders.
 *
 * Three behaviours here are worth knowing before changing anything:
 *
 * 1. The server is the only source of room state. Nothing is applied optimistically — a vote
 *    is drawn as selected because the server echoed it back, so what you see is what the room
 *    sees. Planning poker is low-frequency; the round trip is invisible and the alternative
 *    (local guess, then correction) shows people a card that briefly lies.
 * 2. Re-joining is automatic when you're missing from the roster but were NOT evicted — that
 *    is what makes "clear all users" behave as intended: ghosts (closed tabs) stay gone, and
 *    everyone still present reappears immediately without touching anything.
 * 3. An idle eviction is the one absence that does NOT auto-rejoin, because auto-rejoining
 *    would defeat the sweep it came from. The UI asks instead. This is why the server sends a
 *    machine-readable `code` and this hook never matches on message text.
 * 4. Every `join` is now a TWO-STEP handshake (2026-08-05): `api.joinRoom` (HTTP) mints or
 *    reattaches the participant and lets its secret land in an HttpOnly cookie via
 *    `Set-Cookie`, THEN the `join` websocket frame — carrying no secret at all — attaches
 *    THIS connection to that row and triggers the roster broadcast. The HTTP step MUST be
 *    awaited before a brand-new socket is opened: the socket's own upgrade handshake is what
 *    would carry the cookie along, so opening it before the mint's `Set-Cookie` has landed in
 *    the jar means a first-time participant's secret never reaches this browser, and a
 *    refresh a moment later starts a second, unlinked participant instead of reattaching.
 *
 *    This step is ONLY for a brand-new socket, though (2026-08-06 correction) — an
 *    ALREADY-OPEN socket's `join` is WS-only, no HTTP mint. The gateway captures its cookie
 *    header once, at connection time, and never refreshes it; an HTTP mint's `Set-Cookie` on
 *    a live connection is invisible to that frozen snapshot, so the WS join would still read
 *    the stale cookie and mint a SECOND, separate participant — every time, not just under a
 *    race. A live "Clear all users" incident cloned the clicker this exact way before the fix.
 *    The cost of skipping it is mild: that rejoin's fresh secret does not reach a cookie until
 *    a genuine future reconnect (a new socket) runs its own mint-before-connect sequence.
 */

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface ScrumRoomApi {
  readonly status: ConnectionStatus;
  readonly room: RoomView | null;
  readonly participantId: string | null;
  readonly isHost: boolean;
  /** True after an idle sweep removed you. Cleared by a successful rejoin. */
  readonly evicted: boolean;
  /** Set when the room is gone for good; the UI stops offering to retry. */
  readonly fatalError: string | null;
  /** A dismissible one-off (rejected card, permission denied, invalid deck). */
  readonly transientError: string | null;
  readonly myVote: string | null;
  dismissError(): void;
  join(name: string): void;
  vote(card: string | null): void;
  setRevealed(revealed: boolean): void;
  resetEstimates(): void;
  clearUsers(): void;
  updateSettings(patch: RoomSettingsPatch): void;
  rename(name: string): void;
}

/** Keeps the proxied socket from idling out. Deliberately below any sane proxy_read_timeout. */
const HEARTBEAT_MS = 45_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

function socketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws/scrum`;
}

export function useScrumRoom(roomId: string | null): ScrumRoomApi {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [evicted, setEvicted] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const attempts = useRef(0);
  // The name we joined with, replayed on every (re)connect. `null` means "not joined yet",
  // which is what keeps the socket closed until the user actually enters a name.
  const nameRef = useRef<string | null>(null);
  const evictedRef = useRef(false);
  const participantRef = useRef<string | null>(null);
  const closedByUs = useRef(false);
  /**
   * Guards the auto-rejoin below against a re-entrant burst, not just a single re-fire.
   *
   * `clearUsers` empties the roster and broadcasts once — but EVERY participant's own
   * subsequent auto-rejoin ALSO broadcasts on success, so an N-person room produces roughly N
   * state frames in quick succession. `participantRef.current` only updates once THIS
   * connection's own `joined` reply comes back; every frame that arrives before that reply
   * lands still finds "my id missing" and, without this guard, would fire a SEPARATE rejoin —
   * each one landing before any of the others' secrets exist yet to reattach to, so the
   * reducer mints a genuinely new participant for every single one. That is the mechanism
   * behind "Clear all users clones me": not one extra join, but as many as there are
   * intervening broadcasts before the first one resolves.
   */
  const rejoinInFlight = useRef(false);

  const send = useCallback((msg: ScrumClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }, []);

  /**
   * The HTTP half of the handshake — mints or reattaches the participant and lets its secret
   * land in a cookie. Never throws: a failed mint still falls through to the websocket `join`,
   * which degrades gracefully (see note 4 above) rather than blocking the room outright on a
   * transient network blip.
   */
  const mintParticipant = useCallback(async (targetRoomId: string, name: string): Promise<void> => {
    try {
      await api.joinRoom(targetRoomId, name);
    } catch {
      /* best-effort — the websocket join below still runs either way */
    }
  }, []);

  /** Sends the (secret-free) websocket `join` frame. Assumes the socket is already open. */
  const sendJoin = useCallback(
    (targetRoomId: string) => {
      const name = nameRef.current;
      if (!name) return;
      send({ type: 'join', roomId: targetRoomId, name });
    },
    [send],
  );

  /**
   * Opens the socket and wires its lifecycle. Safe to call repeatedly; it no-ops when live.
   *
   * The retry recurses into the inner `open` rather than into `connect` itself: a
   * self-reference from inside the useCallback would close over its own TDZ binding, which
   * happens to work at runtime (it only fires later) but is genuinely fragile — and ESLint
   * rejects it outright.
   */
  const connect = useCallback(
    (targetRoomId: string) => {
      async function open(): Promise<void> {
        if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;
        const name = nameRef.current;
        if (!name) return;

        setStatus(attempts.current === 0 ? 'connecting' : 'reconnecting');

        // MUST complete — and its Set-Cookie MUST land in the jar — before the socket below is
        // constructed: the socket's own upgrade handshake is the request that carries the
        // cookie along, and by the time `onopen` fires that handshake has already gone out.
        // Not while evicted: a dropped connection is not activity, so silently re-joining on
        // reconnect would put an idled-out person straight back on the roster the sweep just
        // cleared them from. They stay connected, see the banner, and rejoin deliberately.
        if (!evictedRef.current) await mintParticipant(targetRoomId, name);
        // A concurrent open() (a reconnect timer firing mid-await) may have already won while
        // we were waiting on the mint — never open a second socket on top of it.
        if (socketRef.current) return;

        const socket = new WebSocket(socketUrl());
        socketRef.current = socket;

        socket.onopen = () => {
          attempts.current = 0;
          setStatus('open');
          if (!evictedRef.current) sendJoin(targetRoomId);
        };

        socket.onmessage = (event) => {
          const msg = parseScrumServerMessage(typeof event.data === 'string' ? event.data : '');
          if (!msg) return;

          switch (msg.type) {
            case 'joined':
              rejoinInFlight.current = false;
              participantRef.current = msg.participantId;
              setParticipantId(msg.participantId);
              setIsHost(msg.isHost);
              evictedRef.current = false;
              setEvicted(false);
              return;

            case 'state': {
              setRoom(msg.room);
              // Missing from the roster without an eviction notice means the organizer cleared
              // the room (or the server restarted): step straight back in. See note 2 above.
              //
              // Deliberately WS-only — no HTTP mint here (2026-08-06 fix; a live "Clear all
              // users" incident cloned the clicker every time, not just under a race). The
              // gateway's `conn.cookieHeader` is a snapshot taken once at connection time and
              // never refreshed; an HTTP mint's `Set-Cookie` on an ALREADY-OPEN socket is
              // invisible to that snapshot, so the WS join below would still read the OLD
              // (now-unmatched, post-clear) cookie and mint a SECOND, separate participant —
              // deterministically, every time, regardless of any timing guard. Skipping the
              // HTTP step means exactly one mint happens (via this WS join), at the cost that
              // its fresh secret does not reach a cookie until a genuine future reconnect
              // (new socket) runs its OWN mint-before-connect sequence — a rare "looks like a
              // new join" on a refresh right after a clear, not a guaranteed duplicate.
              //
              // rejoinInFlight still gates this to ONE outstanding attempt: a clear broadcasts
              // once per participant as each one rejoins in turn, and every one of those
              // broadcasts still shows "my id missing" until THIS connection's own `joined`
              // reply lands. Without the guard, each intervening broadcast would fire its own
              // `join` frame before the first one's reply updates `participantRef.current`.
              const me = participantRef.current;
              if (me && !evictedRef.current && !rejoinInFlight.current && !msg.room.participants.some((p) => p.id === me)) {
                rejoinInFlight.current = true;
                sendJoin(msg.room.id);
              }
              return;
            }

            case 'pong':
              return;

            case 'error':
              // Whatever this attempt's outcome, it is no longer IN FLIGHT — including the
              // 'evicted'/fatal branches below, which return early themselves.
              rejoinInFlight.current = false;
              if (msg.code === 'evicted') {
                evictedRef.current = true;
                setEvicted(true);
                return;
              }
              if (msg.fatal) {
                closedByUs.current = true;
                setFatalError(msg.message);
                socket.close();
                return;
              }
              setTransientError(msg.message);
              return;
          }
        };

        socket.onclose = () => {
          socketRef.current = null;
          if (heartbeat.current) {
            clearInterval(heartbeat.current);
            heartbeat.current = null;
          }
          if (closedByUs.current || !nameRef.current) {
            setStatus('closed');
            return;
          }
          // Exponential backoff, capped — a server restart during a planning session should
          // reconnect on its own rather than leave everyone staring at a dead page.
          const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts.current, RECONNECT_MAX_MS);
          attempts.current += 1;
          setStatus('reconnecting');
          reconnectTimer.current = setTimeout(() => void open(), delay);
        };

        socket.onerror = () => {
          // `onclose` always follows and owns the retry; reacting here too would double-schedule.
        };

        heartbeat.current = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS);
      }

      void open();
    },
    [mintParticipant, send, sendJoin],
  );

  // Tear everything down on unmount or a room change; never leave a socket or timer behind.
  useEffect(() => {
    return () => {
      closedByUs.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeat.current) clearInterval(heartbeat.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [roomId]);

  const join = useCallback(
    (name: string) => {
      if (!roomId) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      nameRef.current = trimmed;
      storage.setName(trimmed);
      closedByUs.current = false;
      evictedRef.current = false;
      setEvicted(false);
      setFatalError(null);

      // Already-open socket (e.g. the eviction banner's "Rejoin" button) — WS-only, same
      // reasoning as the auto-rejoin in the 'state' handler above: an HTTP mint here would be
      // invisible to this connection's already-captured cookie snapshot and would mint a
      // second, separate participant every time, not just under a race.
      if (socketRef.current?.readyState === WebSocket.OPEN) sendJoin(roomId);
      else connect(roomId);
    },
    [roomId, connect, sendJoin],
  );

  const vote = useCallback((card: string | null) => send({ type: 'vote', card }), [send]);
  const setRevealed = useCallback((revealed: boolean) => send({ type: revealed ? 'reveal' : 'hide' }), [send]);
  const resetEstimates = useCallback(() => send({ type: 'resetEstimates' }), [send]);
  const clearUsers = useCallback(() => send({ type: 'clearUsers' }), [send]);
  const updateSettings = useCallback(
    (settings: RoomSettingsPatch) => send({ type: 'updateSettings', settings }),
    [send],
  );
  const rename = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      nameRef.current = trimmed;
      storage.setName(trimmed);
      send({ type: 'rename', name: trimmed });
    },
    [send],
  );

  const myVote = room?.participants.find((p) => p.id === participantId)?.vote ?? null;

  return {
    status,
    room,
    participantId,
    isHost,
    evicted,
    fatalError,
    transientError,
    myVote,
    dismissError: useCallback(() => setTransientError(null), []),
    join,
    vote,
    setRevealed,
    resetEstimates,
    clearUsers,
    updateSettings,
    rename,
  };
}
