import express, { type Application, type Request, type Response } from 'express';
import { ParseError, EmitError, validateScripts, type AreaFile } from '@shatteredarchive/merc-area';

import { AreaStore, AreaStoreError } from '../area-store.js';
import { diffLines } from '../diff.js';

/**
 * Area REST API. Every handler is wrapped so no error ever escapes: expected
 * failures map to 4xx with a structured body, the unexpected to a logged 500 —
 * the process never crashes on a request.
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

/** Express 5 types params as string | string[]; area file names are single segments. */
function fileParam(req: Request): string {
  const p = req.params.file;
  return Array.isArray(p) ? p[0] : p;
}

function requireAreaBody(req: Request): AreaFile {
  const body = req.body as { area?: unknown } | undefined;
  if (!body || typeof body !== 'object' || !body.area || typeof body.area !== 'object') {
    throw new AreaStoreError('request body must be JSON: { "area": <AreaFile model> }', 400);
  }
  const area = body.area as AreaFile;
  if (!Array.isArray(area.sections)) {
    throw new AreaStoreError('area model must have a "sections" array', 400);
  }
  return area;
}

/**
 * Scripts are validated semantically (trigger vocabulary, mob-in-file, body
 * budget) before any emit: the C boot loader is strict (bug + exit), so a bad
 * script must never reach disk. Returns the summary for preview responses.
 */
function requireValidScripts(area: AreaFile) {
  const scripts = validateScripts(area);
  if (scripts.errors.length > 0) {
    throw new AreaStoreError(`invalid scripts: ${scripts.errors.join('; ')}`, 400);
  }
  return scripts;
}

export function registerAreaRoutes(app: Application, store: AreaStore): void {
  // Standalone tests mount routes on a bare express(); ensure JSON parsing exists.
  app.use(express.json({ limit: '1mb' }));

  app.get(
    '/api/areas',
    safe((_req, res) => {
      res.json({ areas: store.listAreas() });
    }),
  );

  app.get(
    '/api/areas/:file',
    safe((req, res) => {
      const file = fileParam(req);
      res.json({ file, area: store.readArea(file) });
    }),
  );

  // Preview: emitted text + diff vs what is on disk. Never writes.
  app.post(
    '/api/areas/:file/preview',
    safe((req, res) => {
      const file = fileParam(req);
      const area = requireAreaBody(req);
      const scripts = requireValidScripts(area);
      const text = store.emitValidated(file, area);
      const currentText = store.readAreaText(file);
      res.json({ file, text, diff: diffLines(currentText, text), scripts });
    }),
  );

  // Download the canonical emitted form of what is currently on disk.
  app.get(
    '/api/areas/:file/download',
    safe((req, res) => {
      const file = fileParam(req);
      const text = store.emitValidated(file, store.readArea(file));
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
      res.send(text);
    }),
  );

  // Write-gated save (403 unless MUD_WRITE_ENABLED=true).
  app.put(
    '/api/areas/:file',
    safe((req, res) => {
      const file = fileParam(req);
      const area = requireAreaBody(req);
      requireValidScripts(area);
      const { backupPath } = store.writeArea(file, area);
      res.json({ file, saved: true, backupPath });
    }),
  );
}
