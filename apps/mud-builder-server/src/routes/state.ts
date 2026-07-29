import fs from 'fs';
import path from 'path';
import type { Application, Request, Response } from 'express';
import { parseLiveSnapshot } from '@shatteredarchive/merc-area';

import type { MudBuilderConfig } from '../config.js';

/**
 * AI-ANNOTATION
 * @ai-summary Live-state bridge (Phase 14c): POST /api/state/refresh writes
 *   "state.request" into the area dir (the same file-handshake shape as
 *   reload.signal/copyover.signal) so the running game's next pulse writes a
 *   fresh state.snapshot.json; GET /api/state/live reads that snapshot back.
 *   This is a READ TRIGGER, not authoring — see audit.ts's /api/state
 *   exclusion.
 * @ai-public registerStateRoutes
 * @ai-notes POST is write-gated like reload (MUD_WRITE_ENABLED) since it
 *   touches the shared area dir; the global authGuard in app.ts covers the
 *   bearer check for POST, GET stays open (Phase 9 "reads stay open"). GET
 *   never writes and treats a torn/malformed snapshot the same as absent
 *   (404) rather than surfacing bad JSON to the client — parseLiveSnapshot
 *   is the same tolerant parser the client itself uses.
 */

const REQUEST_FILE = 'state.request';
const SNAPSHOT_FILE = 'state.snapshot.json';

export function registerStateRoutes(app: Application, config: Pick<MudBuilderConfig, 'areaPath' | 'writeEnabled'>): void {
  app.post('/api/state/refresh', (_req: Request, res: Response) => {
    try {
      if (!config.writeEnabled) {
        res.status(403).json({ error: 'state refresh is disabled (MUD_WRITE_ENABLED is not "true")' });
        return;
      }
      const requestPath = path.join(config.areaPath, REQUEST_FILE);
      if (fs.existsSync(requestPath)) {
        res.status(202).json({ requested: false, note: 'a refresh is already pending; the game will serve it shortly' });
        return;
      }
      fs.writeFileSync(requestPath, `${new Date().toISOString()}\n`, 'utf8');
      res.status(202).json({ requested: true });
    } catch (e) {
      res.status(500).json({ error: `internal error: ${(e as Error).message}` });
    }
  });

  app.get('/api/state/live', (_req: Request, res: Response) => {
    try {
      const snapshotPath = path.join(config.areaPath, SNAPSHOT_FILE);
      let stat: fs.Stats;
      let text: string;
      try {
        stat = fs.statSync(snapshotPath);
        text = fs.readFileSync(snapshotPath, 'utf8');
      } catch {
        res.status(404).json({ error: 'no snapshot yet' });
        return;
      }
      const snapshot = parseLiveSnapshot(text);
      if (!snapshot) {
        res.status(404).json({ error: 'no snapshot yet' });
        return;
      }
      res.json({ snapshot, ageMs: Date.now() - stat.mtimeMs });
    } catch (e) {
      res.status(500).json({ error: `internal error: ${(e as Error).message}` });
    }
  });
}
