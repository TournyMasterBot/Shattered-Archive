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
 *    ALREADY-OPEN socket's `join` used to be sent WS-only, no HTTP mint, because the gateway
 *    captures the connection's cookie header once, at connect time, and never refreshes it: an
 *    HTTP mint's `Set-Cookie` on a live connection is invisible to that frozen snapshot, so a
 *    WS join sent on that same socket would still read the stale cookie and mint a SECOND,
 *    separate participant, deterministically.
 *
 *    That WS-only path traded one bug for another (2026-08-12 correction): every rejoin sent
 *    on an already-open socket — post-clear auto-rejoin, post-eviction "Rejoin" — is ALWAYS a
 *    fresh mint (the old row is gone by definition, or the roster wouldn't be missing this
 *    participant in the first place), and a fresh mint's secret can only reach a cookie via an
 *    HTTP `Set-Cookie`. Skipping the HTTP step meant that secret NEVER reached the cookie jar,
 *    so the next refresh or reconnect couldn't find it, minted yet another new participant, and
 *    left the previous rejoin's row behind as a ghost — one extra duplicate per clear/eviction
 *    cycle, not a rare race. `forceFreshRejoin` below closes the socket and lets the normal
 *    reconnect path's mint-before-connect sequence run instead of sending a WS-only frame on
 *    the live socket, so a fresh mint's secret always reaches a cookie the same way a brand-new
 *    tab's does. The cost is one socket cycle (a brief 'connecting' flash) instead of an
 *    in-place frame.
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
   * Guards against two mint/join round-trips racing each other, whether that is a re-entrant
   * burst (see `forceFreshRejoin` below) or a plain double-call into `open()` before either's
   * HTTP mint has resolved — two concurrent `POST .../join` calls each see the SAME
   * not-yet-updated cookie, so neither finds the other's fresh row and both mint separate
   * participants; whichever `Set-Cookie` lands last in the browser wins the jar, orphaning the
   * other one. Set the moment an attempt starts committing to a mint, cleared once it resolves
   * (`joined`/`error`) or the socket that carried it closes.
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
  const joinInFlight = useRef(false);
  /** Set by `forceFreshRejoin` so the next `onclose` skips the backoff delay — this close is
   * deliberate, not a dropped connection, so there is no reason to make the room sit empty for
   * up to a second before everyone reappears. */
  const forceImmediateReconnect = useRef(false);

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
   * Forces a rejoin through the full mint-before-connect handshake rather than a WS-only frame
   * on the live socket. Every caller of this (post-clear auto-rejoin, post-eviction manual
   * rejoin) is asking for a row that is provably gone — the roster wouldn't be missing us
   * otherwise — so this is always a fresh mint, and a fresh mint's secret can only reach a
   * cookie via an HTTP `Set-Cookie`. Closing the socket and letting `onclose` drive the
   * reconnect reuses that exact handshake instead of sending a bare `join` frame whose secret
   * would never reach the jar. See the note-4 doc comment at the top of this file.
   *
   * Both call sites only ever fire this while a socket is confirmed open (a `state` message
   * cannot arrive on a closed one; `join`'s already-open branch checks explicitly), so there is
   * no "no socket" fallback to wire up here. No room id parameter either: the socket being
   * closed already has an `onclose` handler wired up by the `open()` call that created it,
   * closing over the same `targetRoomId` that call used — this just needs to trigger that
   * existing handler's reconnect, not redirect it anywhere new. Declared here, above `connect`,
   * so `connect` can list it as a dependency without a TDZ hazard.
   *
   * Sets `status` itself rather than waiting for `onclose`/`open()` to get around to it: those
   * fire a tick or more later, and in the gap `connecting` (which disables the vote deck, the
   * toolbar, and the join button) would still read false, leaving controls that look live but
   * whose sends silently drop until the new socket is up.
   */
  const forceFreshRejoin = useCallback(() => {
    if (joinInFlight.current) return;
    const socket = socketRef.current;
    if (!socket) return;
    joinInFlight.current = true;
    forceImmediateReconnect.current = true;
    setStatus('connecting');
    socket.close();
  }, []);

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
        // Blocks a second concurrent open() — e.g. the auto-join effect and a manual submit
        // landing in the same tick — from firing its own overlapping HTTP mint before this
        // one's Set-Cookie has reached the jar (see joinInFlight's doc comment above).
        if (joinInFlight.current) return;
        joinInFlight.current = true;

        setStatus(attempts.current === 0 ? 'connecting' : 'reconnecting');

        // MUST complete — and its Set-Cookie MUST land in the jar — before the socket below is
        // constructed: the socket's own upgrade handshake is the request that carries the
        // cookie along, and by the time `onopen` fires that handshake has already gone out.
        // Not while evicted: a dropped connection is not activity, so silently re-joining on
        // reconnect would put an idled-out person straight back on the roster the sweep just
        // cleared them from. They stay connected, see the banner, and rejoin deliberately.
        if (!evictedRef.current) await mintParticipant(targetRoomId, name);
        // A concurrent open() (a reconnect timer firing mid-await) may have already won while
        // we were waiting on the mint — never open a second socket on top of it. Shouldn't be
        // reachable now that joinInFlight guards entry above, but costs nothing to keep.
        if (socketRef.current) {
          joinInFlight.current = false;
          return;
        }

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
              joinInFlight.current = false;
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
              // Routed through forceFreshRejoin (2026-08-12 fix), not a WS-only frame on this
              // socket: this is always a fresh mint (our own row is gone or we wouldn't be
              // missing), and a fresh mint's secret only reaches a cookie via an HTTP
              // Set-Cookie — see forceFreshRejoin's doc comment for why sending a bare `join`
              // frame here silently orphaned a row on every clear.
              //
              // joinInFlight still gates this to ONE outstanding attempt: a clear broadcasts
              // once per participant as each one rejoins in turn, and every one of those
              // broadcasts still shows "my id missing" until THIS connection's own `joined`
              // reply lands. Without the guard, each intervening broadcast would trigger its
              // own rejoin before the first one's reply updates `participantRef.current`.
              const me = participantRef.current;
              if (me && !evictedRef.current && !joinInFlight.current && !msg.room.participants.some((p) => p.id === me)) {
                forceFreshRejoin();
              }
              return;
            }

            case 'pong':
              return;

            case 'error':
              // Whatever this attempt's outcome, it is no longer IN FLIGHT — including the
              // 'evicted'/fatal branches below, which return early themselves.
              joinInFlight.current = false;
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
          // Whatever attempt was riding this socket is over — including a forceFreshRejoin's
          // deliberate close — so the guard must clear here too, or the reconnect call below
          // (or a future legitimate join) would find it permanently stuck true and never run.
          joinInFlight.current = false;
          if (closedByUs.current || !nameRef.current) {
            setStatus('closed');
            return;
          }
          const immediate = forceImmediateReconnect.current;
          forceImmediateReconnect.current = false;
          if (immediate) {
            // A deliberate cycle (forceFreshRejoin), not a dropped connection — reconnect right
            // away rather than making the whole room sit empty for up to a second.
            reconnectTimer.current = setTimeout(() => void open(), 0);
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
    [mintParticipant, send, sendJoin, forceFreshRejoin],
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

      // Already-open socket (e.g. the eviction banner's "Rejoin" button) — this is always a
      // fresh mint (our row is gone, or the banner/panel prompting this click wouldn't be
      // showing), so it goes through forceFreshRejoin's full mint-before-connect handshake
      // rather than a WS-only frame whose secret would never reach a cookie. See its doc
      // comment and note 4 at the top of this file.
      if (socketRef.current?.readyState === WebSocket.OPEN) forceFreshRejoin();
      else connect(roomId);
    },
    [roomId, connect, forceFreshRejoin],
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
