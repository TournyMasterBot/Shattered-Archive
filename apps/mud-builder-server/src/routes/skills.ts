import express, { type Application, type Request, type Response } from 'express';
import { ParseError, EmitError, type SkillsFile } from '@shatteredarchive/merc-area';

import { AreaConflictError, AreaStoreError } from '../area-store.js';
import type { SkillsStore } from '../skills-store.js';

/**
 * skills.dat REST API (Phase 7). Same never-crash contract as areas: expected
 * failures map to 4xx, the unexpected to a logged 500. Saves apply at the
 * next COPYOVER (the C overlay loads at boot only) — responses say so.
 */

type Handler = (req: Request, res: Response) => void | Promise<void>;

function safe(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      if (e instanceof AreaConflictError) {
        // conflict responses carry the current hash so the client can reload
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

const COPYOVER_NOTE = 'skills.dat loads at boot only — run a copyover to apply';

function requireSkillsBody(req: Request): SkillsFile {
  const body = req.body as { skills?: unknown } | undefined;
  if (!body || typeof body !== 'object' || !Array.isArray(body.skills)) {
    throw new AreaStoreError('request body must be JSON: { "skills": SkillEntry[] }', 400);
  }
  return { skills: body.skills as SkillsFile['skills'] };
}

/**
 * Optional conditional-save hash from the PUT body: absent = legacy
 * unconditional save; string = expected overlay bytes; null = "no overlay
 * existed when I loaded" (the stock fallback). Anything else is a 400.
 */
export function readBaseHash(req: Request): { baseHash?: string | null } {
  const body = req.body as { baseHash?: unknown } | undefined;
  if (!body || !('baseHash' in body)) return {};
  if (typeof body.baseHash !== 'string' && body.baseHash !== null) {
    throw new AreaStoreError('baseHash must be a string or null when provided', 400);
  }
  return { baseHash: body.baseHash };
}

export function registerSkillsRoutes(app: Application, store: SkillsStore): void {
  app.use(express.json({ limit: '1mb' }));

  app.get(
    '/api/skills',
    safe((_req, res) => {
      // baseHash null = stock (no overlay file yet); the client sends it back on save
      res.json({ ...store.read(), baseHash: store.hash() });
    }),
  );

  app.post(
    '/api/skills/preview',
    safe((req, res) => {
      const model = requireSkillsBody(req);
      res.json(store.preview(model));
    }),
  );

  app.put(
    '/api/skills',
    safe((req, res) => {
      const model = requireSkillsBody(req);
      const result = store.write(model, readBaseHash(req));
      res.json({ ...result, saved: true, note: COPYOVER_NOTE });
    }),
  );

  app.delete(
    '/api/skills',
    safe((_req, res) => {
      const result = store.remove();
      res.json({ ...result, note: `overlay removed — the compiled table returns at the next copyover` });
    }),
  );
}
