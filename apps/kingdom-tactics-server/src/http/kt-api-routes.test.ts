import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { registerKtApiRoutes, type KtApiRoutesDeps } from './kt-api-routes.js';
import { MatchHistoryStore, type MatchHistoryEntry } from '../persistence/match-history-store.js';
import { ArmyLayoutStore } from '../persistence/army-layout-store.js';

const ACCOUNT_A = 'acct-a';
const ACCOUNT_B = 'acct-b';
const TOKEN_A = 'token-for-a';

function startApp(deps: Partial<KtApiRoutesDeps>, dataDir: string): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  registerKtApiRoutes(app, {
    matchHistory: new MatchHistoryStore(dataDir),
    armyLayouts: new ArmyLayoutStore(dataDir),
    resolveAccountId: async (token) => (token === TOKEN_A ? ACCOUNT_A : undefined),
    ...deps,
  });
  return new Promise((resolve) => {
    const server: Server = app.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve({ base, close: () => new Promise((res) => server.close(() => res())) });
    });
  });
}

function makeMatch(id: string, playedAt: string, accountId: string): MatchHistoryEntry {
  return {
    id,
    matchId: `match-${id}`,
    playedAt,
    participants: [{ side: 0, accountId }],
    winner: 0,
    initial: {} as MatchHistoryEntry['initial'],
    actionLog: [],
    replaySeed: { seed: 1, combatSalt: 2 },
  };
}

describe('GET /api/user-content/summary (Phase H)', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-summary-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('401s anonymously', async () => {
    const { base, close } = await startApp({}, dataDir);
    try {
      const res = await fetch(`${base}/api/user-content/summary`);
      expect(res.status).toBe(401);
    } finally {
      await close();
    }
  });

  it('reports counts, the latest playedAt, and the configured link-out for the caller only', async () => {
    const matchHistory = new MatchHistoryStore(dataDir);
    const armyLayouts = new ArmyLayoutStore(dataDir);
    matchHistory.record(makeMatch('m1', '2026-07-01T00:00:00.000Z', ACCOUNT_A));
    matchHistory.record(makeMatch('m2', '2026-07-15T00:00:00.000Z', ACCOUNT_A));
    matchHistory.record(makeMatch('m3', '2026-07-20T00:00:00.000Z', ACCOUNT_B)); // a different account
    armyLayouts.save(ACCOUNT_A, [{ name: 'Alpha', picks: [{ raceKey: 'human', classKey: 'warrior' }] }]);

    const { base, close } = await startApp(
      { matchHistory, armyLayouts, resolveAccountId: async (t) => (t === TOKEN_A ? ACCOUNT_A : undefined), linkOutUrl: 'https://kt.example.test' },
      dataDir,
    );
    try {
      const res = await fetch(`${base}/api/user-content/summary`, { headers: { authorization: `Bearer ${TOKEN_A}` } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        armyCount: 1,
        matchCount: 2, // only ACCOUNT_A's own two, not acct-b's
        lastMatchAt: '2026-07-15T00:00:00.000Z',
        linkOutUrl: 'https://kt.example.test',
      });
    } finally {
      await close();
    }
  });

  it('reports zero counts, a null lastMatchAt, and a null link-out when unconfigured', async () => {
    const { base, close } = await startApp({}, dataDir);
    try {
      const res = await fetch(`${base}/api/user-content/summary`, { headers: { authorization: `Bearer ${TOKEN_A}` } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ armyCount: 0, matchCount: 0, lastMatchAt: null, linkOutUrl: null });
    } finally {
      await close();
    }
  });
});
