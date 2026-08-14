import fs from 'fs';
import path from 'path';
import type { RequestHandler } from 'express';

import type { BuilderActor } from './auth-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Append-only audit trail (Phase 9): one JSON line per accepted
 *   disk-mutating request / key-lifecycle event, written to audit.log in the
 *   builder data dir (beside the save backups and builder-auth.json).
 * @ai-public appendAudit, auditMiddleware
 * @ai-notes Audit failure must NEVER block the mutation it describes — errors
 *   degrade to console. Lines carry the acting key's id/label, never a token.
 */

const AUDIT_FILE = 'audit.log';

/** Human-readable actor tag for an audit line — covers all three BuilderActor kinds. */
function describeActor(actor: BuilderActor | undefined): string {
  if (!actor) return 'anonymous';
  switch (actor.kind) {
    case 'master':
      return 'master';
    case 'key':
      return `key:${actor.id} (${actor.label})`;
    case 'account':
      // Phase 15: label is the KEY's label (e.g. "ci driver"); username (when introspection
      // returned one) is the actual human — both are worth having in an audit line.
      return `account:${actor.accountId} (${actor.label})${actor.username ? ` [${actor.username}]` : ''}`;
  }
}

/** Appends one timestamped JSON line. Never throws. */
export function appendAudit(dataDir: string, entry: Record<string, unknown>): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(path.join(dataDir, AUDIT_FILE), `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch (e) {
    console.error(`[audit] failed to append to ${path.join(dataDir, AUDIT_FILE)}: ${(e as Error).message}`);
  }
}

/**
 * Records every ACCEPTED (2xx/3xx) non-GET /api/* request on response finish.
 * Previews are excluded — they never touch disk. Presence heartbeats are
 * excluded — transient in-memory state, not a mutation. State-refresh requests
 * (Phase 14c) are excluded — a read trigger, not authoring; auditing it would
 * spam the log every time a builder opens the Simulate pane. Install before
 * the routes.
 */
export function auditMiddleware(dataDir: string): RequestHandler {
  return (req, res, next) => {
    // lowercase: Express route matching is case-insensitive, so '/API/…' still mutates
    const path = req.path.toLowerCase();
    const read = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    if (
      read ||
      !path.startsWith('/api/') ||
      path.endsWith('/preview') ||
      path.startsWith('/api/presence') ||
      path.startsWith('/api/state')
    ) {
      next();
      return;
    }
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const actor = res.locals.builderActor as BuilderActor | undefined;
      appendAudit(dataDir, {
        method: req.method,
        route: req.originalUrl,
        status: res.statusCode,
        actor: describeActor(actor),
      });
    });
    next();
  };
}
