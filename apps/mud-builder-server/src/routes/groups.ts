import express, { type Application, type Request, type Response } from 'express';
import { ParseError, EmitError, type GroupsFile } from '@shatteredarchive/merc-area';

import { AreaConflictError, AreaStoreError } from '../area-store.js';
import type { GroupsStore } from '../groups-store.js';
import { readBaseHash } from './skills.js';

/**
 * groups.dat REST API (Phase 8). Same never-crash contract as areas/skills:
 * expected failures map to 4xx, the unexpected to a logged 500. Saves apply
 * at the next COPYOVER (the C overlay loads at boot only) — responses say so.
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

const COPYOVER_NOTE = 'groups.dat loads at boot only — run a copyover to apply';

function requireGroupsBody(req: Request): GroupsFile {
  const body = req.body as { groups?: unknown } | undefined;
  if (!body || typeof body !== 'object' || !Array.isArray(body.groups)) {
    throw new AreaStoreError('request body must be JSON: { "groups": GroupEntry[] }', 400);
  }
  return { groups: body.groups as GroupsFile['groups'] };
}

export function registerGroupsRoutes(app: Application, store: GroupsStore): void {
  app.use(express.json({ limit: '1mb' }));

  app.get(
    '/api/groups',
    safe((_req, res) => {
      // baseHash null = stock (no overlay file yet); the client sends it back on save
      res.json({ ...store.read(), baseHash: store.hash() });
    }),
  );

  app.post(
    '/api/groups/preview',
    safe((req, res) => {
      const model = requireGroupsBody(req);
      res.json(store.preview(model));
    }),
  );

  app.put(
    '/api/groups',
    safe((req, res) => {
      const model = requireGroupsBody(req);
      const result = store.write(model, readBaseHash(req));
      res.json({ ...result, saved: true, note: COPYOVER_NOTE });
    }),
  );

  app.delete(
    '/api/groups',
    safe((_req, res) => {
      const result = store.remove();
      res.json({ ...result, note: `overlay removed — the compiled table returns at the next copyover` });
    }),
  );
}
