import fs from 'fs';
import path from 'path';

/**
 * AI-ANNOTATION
 * @ai-summary Phase G: per-account snippet storage — `<dataDir>/snippets/
 *   <accountId>.json`, one file per account, whole-collection read/replace
 *   (no per-item server route; the client mutates its own copy of the array
 *   and PUTs the result back). Mirrors kingdom-tactics-server's
 *   JsonAccountStore/ArmyLayoutStore shape (generic-per-account-file +
 *   whole-collection save), adapted as a single non-generic class since this
 *   app has only the one per-account data type — no cross-repo import (same
 *   "duplicated deliberately across the app boundary" rationale as
 *   services-server/src/auth-tiers.ts's own header documents for itself).
 * @ai-public SnippetStore, Snippet, SnippetKind
 * @ai-notes accountId is always a server-generated hex id from auth-server's
 *   introspect response, never raw user input — the format check is defense
 *   in depth, not a response to any observed issue. A missing/malformed file
 *   degrades to an empty list rather than throwing (same "safe read" idiom as
 *   the kt-server precedent).
 */

const VALID_ACCOUNT_ID = /^[a-zA-Z0-9_-]+$/;

/** Curated, named data — worth a higher cap than telemetry, but still bounded. */
const MAX_SNIPPETS_PER_ACCOUNT = 200;

export type SnippetKind = 'room' | 'mob' | 'object' | 'script';

export interface Snippet {
  id: string;
  kind: SnippetKind;
  name: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

function isSnippet(value: unknown): value is Snippet {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    (s.kind === 'room' || s.kind === 'mob' || s.kind === 'object' || s.kind === 'script') &&
    typeof s.name === 'string' &&
    typeof s.createdAt === 'string' &&
    typeof s.updatedAt === 'string'
  );
}

export class SnippetStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'snippets');
  }

  private filePath(accountId: string): string {
    if (!VALID_ACCOUNT_ID.test(accountId)) {
      throw new Error(`invalid accountId: ${JSON.stringify(accountId)}`);
    }
    return path.join(this.dir, `${accountId}.json`);
  }

  list(accountId: string): Snippet[] {
    try {
      const raw = fs.readFileSync(this.filePath(accountId), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isSnippet) : [];
    } catch {
      return [];
    }
  }

  /** Whole-collection replace — the caller mutates its own copy and saves the result. */
  save(accountId: string, snippets: readonly Snippet[]): Snippet[] {
    const capped = snippets.slice(0, MAX_SNIPPETS_PER_ACCOUNT);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.filePath(accountId), JSON.stringify(capped));
    return capped.slice();
  }
}
