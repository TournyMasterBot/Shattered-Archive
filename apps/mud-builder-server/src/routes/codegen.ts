import express, { type Application, type Request, type Response } from 'express';
import { generateSpellC, type SpellSpec } from '@shatteredarchive/merc-area';

import { AreaConflictError, AreaStoreError } from '../area-store.js';
import type { CodegenStore } from '../codegen-store.js';
import type { SkillsStore } from '../skills-store.js';
import { readBaseHash } from './skills.js';

/**
 * Spell-codegen spec REST API (Phase 14a). Same never-crash contract as skills/groups:
 * expected failures map to 4xx, unexpected to a logged 500. GET routes are open (no
 * bearer needed — app.ts's authGuard only gates non-GET); PUT is gated + audited by the
 * global middleware installed in app.ts before this module registers.
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
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  };
}

function requireSpecsBody(req: Request): SpellSpec[] {
  const body = req.body as { specs?: unknown } | undefined;
  if (!body || typeof body !== 'object' || !Array.isArray(body.specs)) {
    throw new AreaStoreError('request body must be JSON: { "specs": SpellSpec[] }', 400);
  }
  return body.specs as SpellSpec[];
}

export function registerCodegenRoutes(app: Application, store: CodegenStore, skillsStore: SkillsStore): void {
  app.use(express.json({ limit: '1mb' }));

  app.get(
    '/api/codegen/spells',
    safe((_req, res) => {
      res.json({ specs: store.readSpecs(), baseHash: store.hash() });
    }),
  );

  app.put(
    '/api/codegen/spells',
    safe((req, res) => {
      const specs = requireSpecsBody(req);
      const existingOverlayNames = new Set(skillsStore.read().skills.map((s) => s.name));
      const result = store.write(specs, { existingOverlayNames, ...readBaseHash(req) });
      res.json({ ...result, saved: true });
    }),
  );

  app.get(
    '/api/codegen/spells/:funName/patch',
    safe((req, res) => {
      const spec = store.readSpecs().find((s) => s.funName === req.params.funName);
      if (!spec) throw new AreaStoreError(`no stored spec with funName '${req.params.funName}'`, 404);
      res.type('text/plain').send(generateSpellC(spec).patchText);
    }),
  );
}
