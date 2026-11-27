import type { LedgerFs } from '@shatteredarchive/copilot-core';

/** An in-memory LedgerFs for tests, with switches to make appends fail. Test helper: excluded from the build. */
export class MemoryFs implements LedgerFs {
  files = new Map<string, string>();
  /** Every append fails. */
  failAppend = false;
  /** Fail an append whose path ends with this text (undefined: none). */
  failPathEnding: string | undefined;

  async append(path: string, text: string): Promise<void> {
    if (this.failAppend || (this.failPathEnding !== undefined && path.endsWith(this.failPathEnding))) throw new Error('disk full: /secret/path');
    this.files.set(path, (this.files.get(path) ?? '') + text);
  }
  async read(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }
  async size(path: string): Promise<number | undefined> {
    return this.files.get(path)?.length;
  }
  async rename(from: string, to: string): Promise<void> {
    this.files.set(to, this.files.get(from) ?? '');
    this.files.delete(from);
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix));
  }
}
