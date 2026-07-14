import type { Application, Request, Response } from 'express';

import { AreaStore, AreaStoreError } from '../area-store.js';

/**
 * Reload trigger. mode "hot" (default) writes `reload.signal` containing the
 * area file name — the MUD's in-place reload (zero downtime). mode "copyover"
 * writes `copyover.signal` — the fresh-slate warm reboot (recovery fallback).
 * Both are write-gated like saves.
 */
export function registerReloadRoutes(app: Application, store: AreaStore): void {
  app.post('/api/reload', (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { mode?: string; file?: string };
      const mode = body.mode ?? 'hot';
      if (mode !== 'hot' && mode !== 'copyover') {
        res.status(400).json({ error: `mode must be "hot" or "copyover" (got ${JSON.stringify(mode)})` });
        return;
      }
      const { signalPath } = store.requestReload(mode, body.file);
      res.status(202).json({ mode, signalPath, note: 'signal written; the MUD applies it on its next pulse' });
    } catch (e) {
      if (e instanceof AreaStoreError) {
        res.status(e.status).json({ error: e.message });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  });
}
