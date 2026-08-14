import express, { type Application, type Request, type Response } from 'express';
import { ParseError, EmitError } from '@shatteredarchive/merc-area';

import { AreaStore, AreaStoreError } from '../area-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary .are import API (Phase 10): quarantine validation of an uploaded
 *   area file (POST preview — full report, never writes) and the gated commit
 *   (PUT — atomic write + backup + area.lst registration for new files).
 * @ai-public registerImportRoutes
 * @ai-notes The /api/import JSON parser is SCOPED and larger (2mb) than the
 *   app-wide 1mb one — it must register FIRST (first parser wins). The preview
 *   path ends in /preview so the audit middleware skips it like other previews.
 */

type Handler = (req: Request, res: Response) => void | Promise<void>;

function safe(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      if (e instanceof AreaStoreError) {
        res.status(e.status).json({ error: e.message });
      } else if (e instanceof ParseError || e instanceof EmitError) {
        res.status(400).json({ error: e.message });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  };
}

function requireImportBody(req: Request): { file: string; text: string; overwrite: boolean } {
  const body = (req.body ?? {}) as { file?: unknown; text?: unknown; overwrite?: unknown };
  if (
    typeof body.file !== 'string' ||
    typeof body.text !== 'string' ||
    (body.overwrite !== undefined && typeof body.overwrite !== 'boolean')
  ) {
    throw new AreaStoreError('request body must be JSON: { "file": "<name>.are", "text": "<file content>" } (optional "overwrite": true)', 400);
  }
  return { file: body.file, text: body.text, overwrite: body.overwrite === true };
}

export function registerImportRoutes(app: Application, store: AreaStore): void {
  // Scoped 2mb parser for uploads. Must be registered before the app-wide 1mb
  // parser (registerAreaRoutes) — the FIRST matching json parser wins.
  app.use('/api/import', express.json({ limit: '2mb' }));

  // Quarantine report: always 200 with the full report; errors inside the
  // report block the commit. Never touches the area dir (works without writes).
  app.post(
    '/api/import/area/preview',
    safe((req, res) => {
      const { file, text } = requireImportBody(req);
      res.json({ report: store.importArea(file, text) });
    }),
  );

  // Commit: write-gated + bearer-guarded (non-GET). Re-validates server-side;
  // 400 on any report error, 409 when overwriting without the explicit flag.
  app.put(
    '/api/import/area',
    safe((req, res) => {
      const { file, text, overwrite } = requireImportBody(req);
      const result = store.importAreaCommit(file, text, { overwrite });
      res.json({
        ...result,
        note: result.requiresCopyover
          ? 'registered in area.lst — the game loads new files at the next copyover (hot reload only covers booted areas)'
          : 'existing listed area replaced — a hot reload will pick it up',
      });
    }),
  );
}
