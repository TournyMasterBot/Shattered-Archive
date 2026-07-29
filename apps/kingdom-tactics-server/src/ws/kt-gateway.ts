import { randomInt } from 'node:crypto';
import type * as http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

import {
  buildMatch,
  createGameDataProvider,
  createGameModeProvider,
  GreedyPolicy,
  KT_PROTOCOL_VERSION,
  MatchSession,
  parseKtClientMessage,
} from '@shatteredarchive/kingdom-tactics-engine';
import type {
  ArmyRoster,
  EngineProviders,
  IAiPolicy,
  KtClientMessage,
  KtServerMessage,
  MatchState,
  Side,
} from '@shatteredarchive/kingdom-tactics-engine';

/**
 * The `/ws/kt` authoritative match gateway. It owns a `MatchSession` per matchId, validates
 * every client frame with `parseKtClientMessage` (untrusted input), routes it through the
 * session (seat + engine authorization), broadcasts the resulting snapshot to that match's
 * subscribers, auto-plays any AI seat, and emits `over` when decided. The per-message logic
 * is factored into `handleClientMessage` so it is unit-testable with a fake `send` — no socket.
 */

/** A connected client. `send` targets THIS connection; the gateway supplies it (fake in tests). */
export interface KtClientConn {
  readonly clientId: string;
  matchId?: string;
  side?: Side;
  send(msg: KtServerMessage): void;
}

/** How a registry builds new matches (all optional; sensible v1 defaults). */
export interface MatchRegistryOptions {
  /** Seed for each new match's RNG stream (default 1). */
  readonly seed?: number;
  /** Seat → AI policy for new matches (default: GreedyPolicy on side 1). */
  readonly aiPolicies?: Readonly<Record<number, IAiPolicy>>;
  /** Initial-state factory for a new match (default: a 1v1 Duel). */
  readonly createInitial?: () => MatchState;
  /**
   * Fixed combat salt for every session this registry builds (tests/replay). Omit in production so
   * the registry injects a distinct crypto-random, server-only salt per match (the engine's
   * MatchSession is isomorphic and never self-generates randomness — the platform edge owns it).
   */
  readonly combatSalt?: number;
}

/**
 * In-memory registry of live matches + their subscribers. `getOrCreate` lazily builds a
 * session (decision 2); `broadcast` fans a server message out to every subscribed connection.
 */
export class MatchRegistry {
  private readonly sessions = new Map<string, MatchSession>();
  private readonly subs = new Map<string, Set<KtClientConn>>();
  private readonly providers: EngineProviders;
  private readonly seed: number;
  private readonly aiPolicies: Readonly<Record<number, IAiPolicy>>;
  private readonly createInitial: () => MatchState;
  private readonly combatSalt?: number;

  constructor(opts: MatchRegistryOptions = {}) {
    this.providers = { data: createGameDataProvider(), modes: createGameModeProvider() };
    this.seed = opts.seed ?? 1;
    this.aiPolicies = opts.aiPolicies ?? { 1: new GreedyPolicy() };
    this.combatSalt = opts.combatSalt;
    // Default match: deploy a 1v1 Duel via the shared engine factory (client + server build
    // matches identically now). A caller can still inject a custom `createInitial`.
    this.createInitial =
      opts.createInitial ?? (() => buildMatch('duel', DEFAULT_DUEL_ROSTERS, this.providers, { seed: this.seed }));
  }

  getOrCreate(matchId: string): MatchSession {
    let session = this.sessions.get(matchId);
    if (!session) {
      session = new MatchSession({
        matchId,
        initial: this.createInitial(),
        providers: this.providers,
        seed: this.seed,
        aiPolicies: this.aiPolicies,
        // Injected fixed salt (tests/replay) or a fresh crypto-random, server-only secret per match.
        combatSalt: this.combatSalt ?? randomInt(0x100000000),
      });
      this.sessions.set(matchId, session);
      this.subs.set(matchId, new Set());
    }
    return session;
  }

  get(matchId: string): MatchSession | undefined {
    return this.sessions.get(matchId);
  }

  subscribe(matchId: string, conn: KtClientConn): void {
    this.getOrCreate(matchId);
    this.subs.get(matchId)?.add(conn);
  }

  unsubscribe(matchId: string, conn: KtClientConn): void {
    this.subs.get(matchId)?.delete(conn);
  }

  broadcast(matchId: string, msg: KtServerMessage): void {
    for (const conn of this.subs.get(matchId) ?? []) conn.send(msg);
  }
}

/** Auto-play AI seats to a human turn (or victory), broadcasting a snapshot per action + `over`. */
function driveAi(session: MatchSession, registry: MatchRegistry, onMatchComplete?: (session: MatchSession) => void): void {
  for (const state of session.runAiUntilHuman()) {
    registry.broadcast(session.matchId, { type: 'snapshot', matchId: session.matchId, state });
  }
  if (session.isOver()) {
    registry.broadcast(session.matchId, overMessage(session));
    if (session.tryClaimForRecording()) onMatchComplete?.(session);
  }
}

function overMessage(session: MatchSession): KtServerMessage {
  return {
    type: 'over',
    matchId: session.matchId,
    state: session.snapshot(),
    winner: session.winner() ?? 'draw',
  };
}

/**
 * Handle one parsed client message. Direct replies go to `conn.send`; state changes are
 * broadcast to the whole match. Socket-free by design (the caller owns the transport).
 *
 * `accountId` (Phase F) is the ALREADY-RESOLVED result of introspecting a `join` message's
 * optional `token` (resolution is async and network-bound, so it happens in the caller —
 * see `setupKtWebSocketGateway`'s `resolveAccountId` — keeping this function itself
 * synchronous and trivially testable with a fake `send`, no socket or network mocking).
 * Ignored for every message type except `join`.
 *
 * `onMatchComplete` (Phase F) fires exactly once per match, the first time it transitions to
 * decided (guarded by `session.tryClaimForRecording()` — both call sites below can observe
 * "over", e.g. a client re-joining an already-decided match, but only the first ever fires
 * this). Intentionally just a callback, not a store reference — persistence stays out of this
 * transport-layer function.
 */
export function handleClientMessage(
  conn: KtClientConn,
  msg: KtClientMessage,
  registry: MatchRegistry,
  accountId?: string,
  onMatchComplete?: (session: MatchSession) => void,
): void {
  switch (msg.type) {
    case 'join': {
      const session = registry.getOrCreate(msg.matchId);
      const side: Side = msg.side ?? 0; // v1: the joining human takes side 0; AI holds side 1.
      const claim = session.claimSeat(side, conn.clientId, accountId);
      if (!claim.ok) {
        conn.send({ type: 'error', matchId: msg.matchId, message: claim.reason });
        return;
      }
      conn.matchId = msg.matchId;
      conn.side = side;
      registry.subscribe(msg.matchId, conn);
      conn.send({
        type: 'joined',
        matchId: msg.matchId,
        side,
        state: session.snapshot(),
        protocol: KT_PROTOCOL_VERSION,
      });
      // If an AI seat happens to be active first, play it out before handing control over.
      driveAi(session, registry, onMatchComplete);
      return;
    }

    case 'action': {
      const session = registry.get(msg.matchId);
      if (!session) {
        conn.send({ type: 'error', matchId: msg.matchId, message: 'no such match' });
        return;
      }
      const res = session.applyClientAction(conn.clientId, msg.action);
      if ('error' in res) {
        conn.send({ type: 'error', matchId: msg.matchId, message: res.error });
        return;
      }
      registry.broadcast(msg.matchId, {
        type: 'snapshot',
        matchId: msg.matchId,
        state: res.state,
        lastAction: res.lastAction,
      });
      if (session.isOver()) {
        registry.broadcast(msg.matchId, overMessage(session));
        if (session.tryClaimForRecording()) onMatchComplete?.(session);
        return;
      }
      driveAi(session, registry, onMatchComplete);
      return;
    }

    case 'requestSnapshot': {
      const session = registry.get(msg.matchId);
      if (!session) {
        conn.send({ type: 'error', matchId: msg.matchId, message: 'no such match' });
        return;
      }
      conn.send({ type: 'snapshot', matchId: msg.matchId, state: session.snapshot() });
      return;
    }

    case 'leave': {
      registry.get(msg.matchId)?.releaseSeat(conn.clientId);
      registry.unsubscribe(msg.matchId, conn);
      conn.matchId = undefined;
      conn.side = undefined;
      return;
    }
  }
}

/** Mount the `/ws/kt` gateway on an existing HTTP server. Returns the wss + registry. */
export function setupKtWebSocketGateway(
  server: http.Server,
  opts: MatchRegistryOptions & {
    onError?: (err: unknown) => void;
    /**
     * Phase F: resolves a `join` message's optional bearer token to an accountId.
     * MUST NOT throw/reject — a missing, invalid, expired, or unreachable-auth-server
     * token all resolve the same way (`undefined`), degrading to today's fully
     * anonymous join rather than rejecting it. Omit entirely to disable token
     * handling altogether (every join is anonymous, byte-identical to pre-Phase-F).
     */
    resolveAccountId?: (token: string) => Promise<string | undefined>;
    /** Phase F: fires exactly once per match, right when it transitions to decided — see `handleClientMessage`'s doc for the exactly-once guarantee. Typically wired to a persistence store's record() call. */
    onMatchComplete?: (session: MatchSession) => void;
  } = {},
): { wss: WebSocketServer; registry: MatchRegistry } {
  const wss = new WebSocketServer({ server, path: '/ws/kt' });
  const registry = new MatchRegistry(opts);
  let nextClientId = 1;

  wss.on('connection', (ws: WebSocket) => {
    const conn: KtClientConn = {
      clientId: `c${nextClientId++}`,
      send: (msg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
    };

    ws.on('message', (raw: Buffer) => {
      const msg = parseKtClientMessage(raw.toString('utf-8'));
      if (!msg) {
        conn.send({ type: 'error', matchId: conn.matchId, message: 'invalid message' });
        return;
      }
      (async () => {
        // Resolve BEFORE the try/catch below: resolveAccountId's own contract already
        // guarantees it never throws, but this keeps a misbehaving implementation from
        // ever turning into a rejected join instead of an anonymous one.
        let accountId: string | undefined;
        if (msg.type === 'join' && msg.token && opts.resolveAccountId) {
          accountId = await opts.resolveAccountId(msg.token).catch(() => undefined);
        }
        try {
          handleClientMessage(conn, msg, registry, accountId, opts.onMatchComplete);
        } catch (err) {
          opts.onError?.(err);
          conn.send({ type: 'error', matchId: conn.matchId, message: getErrorMessage(err) });
        }
      })();
    });

    ws.on('close', () => {
      if (conn.matchId) {
        registry.get(conn.matchId)?.releaseSeat(conn.clientId);
        registry.unsubscribe(conn.matchId, conn);
      }
    });

    ws.on('error', (err) => opts.onError?.(err));
  });

  return { wss, registry };
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown error';
}

/** Default 1v1 Duel rosters (one Human Warrior a side) — deployed via the shared `buildMatch`. */
const DEFAULT_DUEL_ROSTERS: readonly ArmyRoster[] = [
  { side: 0, name: 'Player 0', picks: [{ raceKey: 'Human', classKey: 'Warrior' }] },
  { side: 1, name: 'Player 1', picks: [{ raceKey: 'Human', classKey: 'Warrior' }] },
];
