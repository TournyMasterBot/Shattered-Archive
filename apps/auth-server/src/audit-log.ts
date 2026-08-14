import fs from 'fs';
import path from 'path';

/**
 * AI-ANNOTATION
 * @ai-summary Append-only JSONL audit trail for A2 admin actions (role changes,
 *   temp-passwords) — one line per entry under DATA_DIR (host-mount constraint;
 *   mirrors mud-builder's audit.log precedent). Written, never read back by the
 *   app: it's for the operator's grep, not for program logic.
 * @ai-public AuditLog, AuditEntry
 */

export interface AuditEntry {
  at: string;
  actorId: string;
  actorUsername: string;
  action: string;
  targetId?: string;
  targetUsername?: string;
  detail?: string;
}

export class AuditLog {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'audit.log');
  }

  append(entry: Omit<AuditEntry, 'at'>): void {
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry } satisfies AuditEntry);
    fs.appendFileSync(this.filePath, `${line}\n`, 'utf8');
  }
}
