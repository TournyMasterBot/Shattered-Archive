import {
  createGameDataProvider,
  createGameModeProvider,
  createRng,
  GreedyPolicy,
} from '@shatteredarchive/kingdom-tactics-engine';
import type {
  Board,
  EngineProviders,
  KtServerMessage,
  MatchState,
  Tile,
  Unit,
} from '@shatteredarchive/kingdom-tactics-engine';
import { MatchRegistry, handleClientMessage, type KtClientConn } from './kt-gateway.js';

const providers: EngineProviders = {
  data: createGameDataProvider(),
  modes: createGameModeProvider(),
};

/** A fake connection that records everything the gateway sends to it. */
function fakeConn(clientId: string): KtClientConn & { sent: KtServerMessage[] } {
  const sent: KtServerMessage[] = [];
  return {
    clientId,
    sent,
    send(msg: KtServerMessage) {
      sent.push(msg);
    },
  };
}

function board(w: number, h: number): Board {
  const tiles: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) row.push({ terrain: 'Field', feature: null });
    tiles.push(row);
  }
  return { width: w, height: h, tiles };
}

function unit(instanceId: string, pos: { x: number; y: number }, side: number, hp = 999): Unit {
  return { kind: 'unit', instanceId, templateId: 'Human:Warrior', side, pos, hp, statuses: [], hasMoved: false, hasActed: false };
}

/** A dominant side-0 (two warriors) vs one weak side-1 defender — a known side-0 victory. */
function dominantMatch(): MatchState {
  return {
    modeId: 'skirmish',
    board: board(8, 8),
    armies: [],
    tokens: [unit('a1', { x: 3, y: 3 }, 0), unit('a2', { x: 3, y: 4 }, 0), unit('d', { x: 4, y: 3 }, 1, 30)],
    turn: 1,
    activeSide: 0,
    moon: { type: 'White', phase: 'HalfMoon' },
    rngState: 1,
    status: 'in-progress',
  };
}

describe('/ws/kt gateway (handleClientMessage)', () => {
  it('a join yields a joined reply with seat 0, the state, and the protocol version', () => {
    const registry = new MatchRegistry({ seed: 1 });
    const conn = fakeConn('c1');
    handleClientMessage(conn, { type: 'join', matchId: 'm1' }, registry);

    const joined = conn.sent.find((m) => m.type === 'joined');
    expect(joined).toBeDefined();
    if (joined?.type === 'joined') {
      expect(joined.side).toBe(0);
      expect(joined.protocol).toBe(1);
      expect(joined.state.status).toBe('in-progress');
    }
    expect(conn.side).toBe(0);
    expect(conn.matchId).toBe('m1');
  });

  it('a legal action broadcasts a snapshot and then drives the AI seat', () => {
    const registry = new MatchRegistry({ seed: 1 });
    const conn = fakeConn('c1');
    handleClientMessage(conn, { type: 'join', matchId: 'm1' }, registry);
    conn.sent.length = 0;

    // Human (side 0) ends its turn → snapshot broadcast, then AI (side 1) auto-plays.
    handleClientMessage(conn, { type: 'action', matchId: 'm1', action: { type: 'end-turn', side: 0 } }, registry);

    const snapshots = conn.sent.filter((m) => m.type === 'snapshot');
    expect(snapshots.length).toBeGreaterThan(0);
    // Control has returned to the human (or the match ended).
    const session = registry.get('m1');
    expect(session && (session.isOver() || session.snapshot().activeSide === 0)).toBeTruthy();
  });

  it('an action for a seat the caller does not own is rejected with an error', () => {
    const registry = new MatchRegistry({ seed: 1 });
    const conn = fakeConn('c1');
    handleClientMessage(conn, { type: 'join', matchId: 'm1' }, registry);
    conn.sent.length = 0;

    // 's1-u0' belongs to side 1 (AI) — c1 holds side 0. (Ids come from the shared buildMatch factory.)
    handleClientMessage(conn, { type: 'action', matchId: 'm1', action: { type: 'move', tokenId: 's1-u0', to: { x: 3, y: 1 } } }, registry);

    expect(conn.sent.some((m) => m.type === 'error')).toBe(true);
    expect(conn.sent.some((m) => m.type === 'snapshot')).toBe(false);
  });

  it('an action on an unknown match yields an error', () => {
    const registry = new MatchRegistry({ seed: 1 });
    const conn = fakeConn('c1');
    handleClientMessage(conn, { type: 'action', matchId: 'ghost', action: { type: 'end-turn', side: 0 } }, registry);
    expect(conn.sent.at(-1)?.type).toBe('error');
  });

  it('plays a full duel (human seat 0 + Greedy AI seat 1) through to an over message', () => {
    const registry = new MatchRegistry({ seed: 1, createInitial: dominantMatch, combatSalt: 42 });
    const conn = fakeConn('c1');
    handleClientMessage(conn, { type: 'join', matchId: 'm2' }, registry);

    const humanBrain = new GreedyPolicy();
    const chooseRng = createRng(0); // GreedyPolicy is rng-free; a throwaway stream satisfies the signature.

    let guard = 0;
    while (!conn.sent.some((m) => m.type === 'over') && guard < 5000) {
      guard++;
      const session = registry.get('m2');
      if (!session || session.isOver() || session.snapshot().activeSide !== 0) break;
      const action = humanBrain.chooseAction(session.snapshot(), 0, providers, chooseRng);
      const before = conn.sent.length;
      handleClientMessage(conn, { type: 'action', matchId: 'm2', action }, registry);
      // If the greedy pick was rejected as illegal, force an end-turn to guarantee progress.
      if (conn.sent[before]?.type === 'error') {
        handleClientMessage(conn, { type: 'action', matchId: 'm2', action: { type: 'end-turn', side: 0 } }, registry);
      }
    }

    const over = conn.sent.find((m) => m.type === 'over');
    expect(over).toBeDefined();
    if (over?.type === 'over') expect(over.winner).toBe(0);
  });
});
