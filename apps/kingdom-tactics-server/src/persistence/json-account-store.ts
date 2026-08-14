import fs from 'fs';
import path from 'path';

/**
 * Generic per-account JSON-array file store: `<dataDir>/<subdir>/<accountId>.json`. Each
 * account gets its own file — no shared index, no concurrent-write contention across accounts.
 * A missing or malformed file degrades to an empty list rather than throwing (same "safe read"
 * idiom as game-client's own localStorage helpers).
 *
 * `accountId` is always a server-generated hex id from auth-server's introspect response, never
 * raw user input — the format check below is defense in depth against it ever being used to
 * build a file path outside `subdir`, not a response to any observed issue.
 */
const VALID_ACCOUNT_ID = /^[a-zA-Z0-9_-]+$/;

export class JsonAccountStore<T> {
  private readonly dir: string;

  constructor(dataDir: string, subdir: string) {
    this.dir = path.join(dataDir, subdir);
  }

  private filePath(accountId: string): string {
    if (!VALID_ACCOUNT_ID.test(accountId)) {
      throw new Error(`invalid accountId: ${JSON.stringify(accountId)}`);
    }
    return path.join(this.dir, `${accountId}.json`);
  }

  list(accountId: string): T[] {
    try {
      const raw = fs.readFileSync(this.filePath(accountId), 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  save(accountId: string, items: readonly T[]): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.filePath(accountId), JSON.stringify(items));
  }
}
