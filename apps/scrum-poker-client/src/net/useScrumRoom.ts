import { useCallback, useEffect, useRef, useState } from 'react';

import { parseScrumServerMessage } from './parse-server-message.js';
import type { RoomSettingsPatch, RoomView, ScrumClientMessage } from '@shatteredarchive/scrum-poker-core';
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
  const secretRef = useRef<string | null>(null);
  const closedByUs = useRef(false);

  const send = useCallback((msg: ScrumClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }, []);

  const sendJoin = useCallback(
    (targetRoomId: string) => {
      const name = nameRef.current;
      if (!name) return;
      const msg: ScrumClientMessage = { type: 'join', roomId: targetRoomId, name };
      // The SECRET is what re-attaches us, never the public participant id — see storage.ts.
      const storedSecret = secretRef.current ?? storage.getParticipantSecret(targetRoomId);
      if (storedSecret) msg.participantSecret = storedSecret;
      const hostToken = storage.getHostToken(targetRoomId);
      if (hostToken) msg.hostToken = hostToken;
      send(msg);
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
      function open(): void {
        if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

        setStatus(attempts.current === 0 ? 'connecting' : 'reconnecting');
        const socket = new WebSocket(socketUrl());
        socketRef.current = socket;

        socket.onopen = () => {
          attempts.current = 0;
          setStatus('open');
          // Not while evicted: a dropped connection is not activity, so silently re-joining on
          // reconnect would put an idled-out person straight back on the roster the sweep just
          // cleared them from. They stay connected, see the banner, and rejoin deliberately.
          if (!evictedRef.current) sendJoin(targetRoomId);
        };

        socket.onmessage = (event) => {
          const msg = parseScrumServerMessage(typeof event.data === 'string' ? event.data : '');
          if (!msg) return;

          switch (msg.type) {
            case 'joined':
              participantRef.current = msg.participantId;
              secretRef.current = msg.participantSecret;
              setParticipantId(msg.participantId);
              setIsHost(msg.isHost);
              storage.setParticipantSecret(msg.roomId, msg.participantSecret);
              evictedRef.current = false;
              setEvicted(false);
              return;

            case 'state': {
              setRoom(msg.room);
              // Missing from the roster without an eviction notice means the organizer cleared
              // the room (or the server restarted): step straight back in. See note 2 above.
              const me = participantRef.current;
              if (me && !evictedRef.current && !msg.room.participants.some((p) => p.id === me)) {
                sendJoin(msg.room.id);
              }
              return;
            }

            case 'pong':
              return;

            case 'error':
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
          reconnectTimer.current = setTimeout(open, delay);
        };

        socket.onerror = () => {
          // `onclose` always follows and owns the retry; reacting here too would double-schedule.
        };

        heartbeat.current = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS);
      }

      open();
    },
    [send, sendJoin],
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
