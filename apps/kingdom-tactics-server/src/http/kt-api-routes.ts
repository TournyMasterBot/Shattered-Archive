import express, { type Application } from 'express';

import { createGameDataProvider, createGameModeProvider, replayMatch, type EngineProviders } from '@shatteredarchive/kingdom-tactics-engine';

import { requireAccount } from './auth-guard.js';
import type { MatchHistoryStore } from '../persistence/match-history-store.js';
import type { ArmyLayoutStore, SavedArmy } from '../persistence/army-layout-store.js';

const MAX_ARMIES_PER_REQUEST = 100;

export interface KtApiRoutesDeps {
  readonly matchHistory: MatchHistoryStore;
  readonly armyLayouts: ArmyLayoutStore;
  readonly resolveAccountId: ((token: string) => Promise<string | undefined>) | undefined;
  /** kt-client's own origin, for the Phase H dashboard summary's link-out — omitted from the
   * response entirely when unset rather than guessed. */
  readonly linkOutUrl?: string;
  /**
   * BROWSER-facing auth-server origin, served by GET /api/kt/config so the client can enrol a
   * device key. Must be the explicitly-set AUTH_SERVER_PUBLIC_URL only — never index.ts's
   * `publicAuthServerUrl`, which falls back to the internal docker alias. Unset = the client
   * never offers device enrolment and stays on SSO-only login.
   */
  readonly authPublicUrl?: string;
}

function isSavedArmy(x: unknown): x is SavedArmy {
  if (typeof x !== 'object' || x === null) return false;
  const rec = x as Record<string, unknown>;
  if (typeof rec.name !== 'string' || !rec.name.trim()) return false;
  if (!Array.isArray(rec.picks)) return false;
  return rec.picks.every((p) => {
    if (typeof p !== 'object' || p === null) return false;
    const pick = p as Record<string, unknown>;
    return typeof pick.raceKey === 'string' && typeof pick.classKey === 'string' && (pick.god === undefined || typeof pick.god === 'string');
  });
}

/**
 * Phase F: kingdom-tactics-server's first-ever HTTP surface beyond `/` and `/health`.
 * Account-scoped (match history, replay, army layouts) — every route requires a valid hub
 * bearer token (see `requireAccount`); there is no anonymous equivalent for "my" data.
 */
export function registerKtApiRoutes(app: Application, deps: KtApiRoutesDeps): void {
  const providers: EngineProviders = { data: createGameDataProvider(), modes: createGameModeProvider() };
  const guard = requireAccount(deps.resolveAccountId);

  app.use('/api/kt', express.json({ limit: '256kb' }));

  /**
   * Deliberately UNGUARDED and deliberately empty-by-default: the client needs the
   * BROWSER-facing auth origin before it holds any credential, in order to enrol a device
   * key. Nothing here is sensitive — it is a public origin the user is about to be sent to.
   *
   * `authPublicUrl` is only ever the explicitly-configured AUTH_SERVER_PUBLIC_URL. It must NOT
   * reuse index.ts's `publicAuthServerUrl`, which falls back to `authServerUrl` — in docker
   * that is the internal alias (auth-server.shatteredarchive.dev:62000), and handing a browser
   * an origin it cannot resolve would fail silently instead of cleanly falling back to the
   * existing SSO-only login. Absent = no device enrolment offered.
   */
  app.get('/api/kt/config', (_req, res) => {
    res.json({ authPublicUrl: deps.authPublicUrl });
  });

  app.get('/api/kt/match-history', guard, (_req, res) => {
    const accountId = res.locals.accountId as string;
    res.json(deps.matchHistory.listSummaries(accountId));
  });

  app.get('/api/kt/match-history/:id/replay', guard, (req, res) => {
    const accountId = res.locals.accountId as string;
    const entry = deps.matchHistory.get(accountId, String(req.params.id));
    if (!entry) {
      res.status(404).json({ error: 'no such match history entry' });
      return;
    }
    const snapshots = replayMatch(entry.matchId, entry.initial, providers, entry.actionLog, entry.replaySeed);
    res.json({ matchId: entry.matchId, snapshots });
  });

  app.get('/api/kt/army-layouts', guard, (req, res) => {
    const accountId = res.locals.accountId as string;
    res.json(deps.armyLayouts.list(accountId));
  });

  app.put('/api/kt/army-layouts', guard, (req, res) => {
    const accountId = res.locals.accountId as string;
    const body = req.body;
    if (!Array.isArray(body)) {
      res.status(400).json({ error: 'body must be an array of saved armies' });
      return;
    }
    if (body.length > MAX_ARMIES_PER_REQUEST) {
      res.status(400).json({ error: `too many armies: ${body.length} exceeds the ${MAX_ARMIES_PER_REQUEST}-army cap` });
      return;
    }
    for (let i = 0; i < body.length; i++) {
      if (!isSavedArmy(body[i])) {
        res.status(400).json({ error: `item[${i}]: not a valid saved army` });
        return;
      }
    }
    deps.armyLayouts.save(accountId, body as SavedArmy[]);
    res.json({ count: body.length });
  });

  // Phase H: the C# dashboard's on-behalf-of fan-out card reads this — same route name as
  // mud-builder-server's own summary endpoint for a uniform caller.
  app.get('/api/user-content/summary', guard, (req, res) => {
    const accountId = res.locals.accountId as string;
    const armyCount = deps.armyLayouts.list(accountId).length;
    const matches = deps.matchHistory.listSummaries(accountId);
    const lastMatchAt = matches.reduce<string | null>((latest, m) => (!latest || m.playedAt > latest ? m.playedAt : latest), null);
    res.json({
      armyCount,
      matchCount: matches.length,
      lastMatchAt,
      linkOutUrl: deps.linkOutUrl ?? null,
    });
  });
}
