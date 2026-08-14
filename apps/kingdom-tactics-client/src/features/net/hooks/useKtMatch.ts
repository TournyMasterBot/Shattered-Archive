import { useCallback, useEffect, useRef, useState } from 'react';

import type { Action, MatchState, Side } from '@shatteredarchive/kingdom-tactics-engine';
import { KtSocket, type KtSocketStatus, type SocketFactory } from '../kt-socket';
import { getToken, isExpired } from '../../auth/authTokenStore';

/** What `connect` needs: where to dial, which match, and (optionally) which seat to request. */
export interface KtConnectConfig {
  readonly url: string;
  readonly matchId: string;
  readonly side?: Side;
}

export interface UseKtMatch {
  readonly connect: (cfg: KtConnectConfig) => void;
  readonly submit: (action: Action) => void;
  readonly leave: () => void;
  readonly status: KtSocketStatus | 'idle';
  /** The seat the server granted, or null before `joined`. */
  readonly side: Side | null;
  /** The latest authoritative state (from `joined`/`snapshot`/`over`), or null before joining. */
  readonly snapshot: MatchState | null;
  readonly error: string | null;
  readonly winner: Side | 'draw' | null;
  readonly over: boolean;
}

/**
 * React hook driving one online match over a {@link KtSocket}. It is server-authoritative: it
 * holds NO local reducer — every state it exposes comes from a server frame. `connect` opens the
 * socket and sends `join` on open; incoming `joined`/`snapshot`/`over` replace the snapshot,
 * `over` also latches winner+over, `error` surfaces a message. A generation ref (mirroring
 * `useSimBatch`) means a stale socket's late frames can never commit over a newer connection, and
 * unmount/`leave` sends `leave` then closes. Tests inject a fake socket factory.
 */
export function useKtMatch(open?: SocketFactory): UseKtMatch {
  const [status, setStatus] = useState<KtSocketStatus | 'idle'>('idle');
  const [side, setSide] = useState<Side | null>(null);
  const [snapshot, setSnapshot] = useState<MatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [winner, setWinner] = useState<Side | 'draw' | null>(null);
  const [over, setOver] = useState(false);

  // Bumped on every connect and on unmount; a socket's callbacks only commit while current.
  const genRef = useRef(0);
  const socketRef = useRef<KtSocket | null>(null);
  const matchIdRef = useRef<string | null>(null);
  // Mirrors `over` so the empty-deps `submit` can guard without a stale closure.
  const overRef = useRef(false);

  const teardown = useCallback(() => {
    const sock = socketRef.current;
    const matchId = matchIdRef.current;
    if (sock && matchId) {
      try {
        sock.send({ type: 'leave', matchId });
      } catch {
        // socket may already be closed — closing below is enough.
      }
    }
    sock?.close();
    socketRef.current = null;
    matchIdRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      genRef.current += 1;
      teardown();
    };
  }, [teardown]);

  const connect = useCallback(
    (cfg: KtConnectConfig) => {
      // Drop any prior connection before opening a new one.
      teardown();
      const gen = (genRef.current += 1);
      const current = () => genRef.current === gen;

      setStatus('connecting');
      setSide(null);
      setSnapshot(null);
      setError(null);
      setWinner(null);
      setOver(false);
      overRef.current = false;
      matchIdRef.current = cfg.matchId;

      const socket = new KtSocket(
        cfg.url,
        {
          onOpen: () => {
            if (!current()) return;
            setStatus('open');
            // Phase F: attach a valid stored token, if any, so the seat gets an accountId server
            // side (match history/replay). Purely additive — omitted or expired, join proceeds
            // exactly as before this phase (anonymous).
            const stored = getToken();
            const token = stored && !isExpired(stored) ? stored.token : undefined;
            socket.send({ type: 'join', matchId: cfg.matchId, side: cfg.side, token });
          },
          onClose: () => {
            if (current()) setStatus('closed');
          },
          onError: () => {
            if (current()) setError('Connection error.');
          },
          onMessage: (msg) => {
            if (!current()) return;
            switch (msg.type) {
              case 'joined':
                setSide(msg.side);
                setSnapshot(msg.state);
                break;
              case 'snapshot':
                setSnapshot(msg.state);
                break;
              case 'over':
                setSnapshot(msg.state);
                setWinner(msg.winner);
                setOver(true);
                overRef.current = true;
                break;
              case 'error':
                setError(msg.message);
                break;
            }
          },
        },
        open,
      );
      socketRef.current = socket;
    },
    [open, teardown],
  );

  const submit = useCallback((action: Action) => {
    const sock = socketRef.current;
    const matchId = matchIdRef.current;
    if (!sock || !matchId || sock.status !== 'open' || overRef.current) return;
    sock.send({ type: 'action', matchId, action });
  }, []);

  const leave = useCallback(() => {
    genRef.current += 1;
    teardown();
    setStatus('idle');
  }, [teardown]);

  return { connect, submit, leave, status, side, snapshot, error, winner, over };
}
