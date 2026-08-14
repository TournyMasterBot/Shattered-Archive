import type { Application, Request, Response } from 'express';
import { ParseError, simulateResets, type SimulateResetsResult } from '@shatteredarchive/merc-area';

import { AreaStoreError, type AreaStore } from '../area-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Read-only spawn preview (Phase 13): GET /api/areas/:file/spawn
 *   runs merc-area's simulateResets over the parsed on-disk model, with the
 *   world vnum index (Phase 11) wired as its cross-area resolver, so a
 *   builder can see what #RESETS actually spawns on first boot without
 *   touching the game.
 * @ai-public registerSpawnRoutes
 * @ai-notes Pure view over an existing store read — never writes, never
 *   audited (GET). Mirrors routes/areas.ts's `safe()` error taxonomy rather
 *   than routes/map.ts's simpler one: a parse failure must 400 with the
 *   parse error here (map.ts's single-file route never promised that).
 */

type Handler = (req: Request, res: Response) => void;

function safe(handler: Handler): Handler {
  return (req, res) => {
    try {
      handler(req, res);
    } catch (e) {
      if (e instanceof AreaStoreError) {
        res.status(e.status).json({ error: e.message });
      } else if (e instanceof ParseError) {
        res.status(400).json({ error: e.message });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  };
}

export function registerSpawnRoutes(app: Application, store: AreaStore): void {
  app.get(
    '/api/areas/:file/spawn',
    safe((req, res) => {
      const file = String(req.params.file);
      const area = store.readArea(file);
      const index = store.worldVnumIndex(file);
      const result: SimulateResetsResult = simulateResets(area, {
        resolveExternal: (kind, vnum) => index[kind].get(vnum) ?? null,
      });
      res.json(result);
    }),
  );
}
