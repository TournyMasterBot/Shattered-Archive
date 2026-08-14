import express, { type Application, type Request, type Response } from 'express';
import { ParseError, EmitError, validateScripts, type AreaFile } from '@shatteredarchive/merc-area';

import { AreaStore, AreaStoreError, AreaConflictError } from '../area-store.js';
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
      if (e instanceof AreaConflictError) {
        res.status(e.status).json({ error: e.message, currentHash: e.currentHash });
      } else if (e instanceof AreaStoreError) {
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

/**
 * Vnum reference integrity: an in-range reference to an entity missing from
 * the file (a reset spawning a deleted mob, an exit into a deleted room) is a
 * broken world the game would log every repop — reject it before it reaches
 * disk. Cross-area links resolve against the world index (Phase 11): proven
 * ones come back as structured external refs for linking, and only vnums no
 * listed area defines remain warnings.
 */
function requireValidRefs(store: AreaStore, file: string, area: AreaFile) {
  const refs = store.resolveRefs(area, file);
  if (refs.errors.length > 0) {
    throw new AreaStoreError(`broken vnum references: ${refs.errors.join('; ')}`, 400);
  }
  return { errors: refs.errors, warnings: refs.warnings, external: refs.external };
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

  // Create a new area file + area.lst registration. Hot reload cannot pick up
  // a file the game did not see at boot (area_reload.c refuses it), so the
  // response tells the caller a copyover is required for first load.
  app.post(
    '/api/areas',
    safe((req, res) => {
      const body = (req.body ?? {}) as {
        file?: unknown;
        name?: unknown;
        credits?: unknown;
        minVnum?: unknown;
        maxVnum?: unknown;
      };
      if (
        typeof body.file !== 'string' ||
        typeof body.name !== 'string' ||
        typeof body.minVnum !== 'number' ||
        typeof body.maxVnum !== 'number' ||
        (body.credits !== undefined && typeof body.credits !== 'string')
      ) {
        throw new AreaStoreError(
          'request body must be JSON: { "file", "name", "minVnum", "maxVnum" } (optional "credits")',
          400,
        );
      }
      const result = store.createArea({
        file: body.file,
        name: body.name,
        credits: body.credits,
        minVnum: body.minVnum,
        maxVnum: body.maxVnum,
      });
      res.status(201).json({
        ...result,
        created: true,
        note: 'registered in area.lst — the game loads new files at the next copyover (hot reload only covers booted areas)',
      });
    }),
  );

  app.get(
    '/api/areas/:file',
    safe((req, res) => {
      const file = fileParam(req);
      // baseHash identifies the exact on-disk bytes this model came from; a
      // later save can send it back to detect concurrent modification.
      res.json({ file, area: store.readArea(file), baseHash: store.areaHash(file) });
    }),
  );

  // Preview: emitted text + diff vs what is on disk. Never writes.
  app.post(
    '/api/areas/:file/preview',
    safe((req, res) => {
      const file = fileParam(req);
      const area = requireAreaBody(req);
      const scripts = requireValidScripts(area);
      const refs = requireValidRefs(store, file, area);
      store.assertHeaderChangeSafe(file, area);
      const text = store.emitValidated(file, area);
      const currentText = store.readAreaText(file);
      res.json({ file, text, diff: diffLines(currentText, text), scripts, refs });
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

  // Write-gated save (403 unless MUD_WRITE_ENABLED=true). An optional
  // baseHash makes the save conditional: 409 { error, currentHash } when the
  // on-disk file changed since it was loaded; absent = unconditional (legacy).
  app.put(
    '/api/areas/:file',
    safe((req, res) => {
      const file = fileParam(req);
      const area = requireAreaBody(req);
      const { baseHash } = req.body as { baseHash?: unknown };
      if (baseHash !== undefined && typeof baseHash !== 'string') {
        throw new AreaStoreError('"baseHash" must be a string when present', 400);
      }
      requireValidScripts(area);
      requireValidRefs(store, file, area);
      store.assertHeaderChangeSafe(file, area);
      const { backupPath, hash } = store.writeArea(file, area, { baseHash });
      res.json({ file, saved: true, backupPath, hash });
    }),
  );
}
