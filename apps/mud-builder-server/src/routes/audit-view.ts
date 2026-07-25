import fs from 'fs';
import path from 'path';
import type { Application } from 'express';

import type { AuthStore } from '../auth-store.js';
import type { MudBuilderConfig } from '../config.js';
import { requireMaster } from './auth.js';

/**
 * AI-ANNOTATION
 * @ai-summary Read-only audit-log viewer (Phase 10): GET /api/audit tails the
 *   append-only backups/audit.log as parsed entries, newest first. Master-only
 *   — audit lines are operator data, like /api/auth.
 * @ai-public registerAuditViewRoutes
 * @ai-notes The log file is never truncated or rewritten by this route. A
 *   missing file is a normal empty state, and an unparseable line degrades to
 *   { raw } instead of failing the request.
 */

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function registerAuditViewRoutes(
  app: Application,
  store: AuthStore,
  dataDir: string,
  introspectConfig: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
): void {
  app.get('/api/audit', requireMaster(store, introspectConfig), (req, res) => {
    try {
      const raw = Number(req.query.limit);
      const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;
      const file = path.join(dataDir, 'audit.log');
      let entries: unknown[] = [];
      if (fs.existsSync(file)) {
        entries = fs
          .readFileSync(file, 'utf8')
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0)
          .slice(-limit)
          .reverse()
          .map((l) => {
            try {
              return JSON.parse(l) as unknown;
            } catch {
              return { raw: l };
            }
          });
      }
      res.json({ entries });
    } catch (e) {
      res.status(500).json({ error: `internal error: ${(e as Error).message}` });
    }
  });
}
