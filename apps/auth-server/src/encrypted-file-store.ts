import fs from 'fs';
import path from 'path';

import { decryptJson, encryptJson, type EncryptedEnvelope } from './crypto-primitives.js';
import { AuthError } from './errors.js';

/**
 * Generic encrypted-JSON-file store shared by account-store, key-store, and
 * service-key-store: atomic tmp+rename writes of an AES-256-GCM envelope
 * (crypto-primitives.ts), mtime-based reload-without-restart, and a
 * corrupt/undecryptable file LOCKS the store rather than silently
 * regenerating it — mirrors mud-builder-server's auth-store.ts, extended with
 * at-rest encryption.
 */
export class EncryptedFileStore<T> {
  private data: T | null = null;
  private locked = false;
  private mtimeMs = 0;

  constructor(
    private readonly filePath: string,
    private readonly key: Buffer,
    private readonly defaultValue: () => T,
  ) {}

  protected read(): T {
    if (this.locked) {
      throw new AuthError(`store unreadable — fix or remove ${this.filePath} on the host and restart`, 500);
    }
    try {
      if (fs.existsSync(this.filePath)) {
        const stat = fs.statSync(this.filePath);
        if (this.data !== null && stat.mtimeMs === this.mtimeMs) return this.data;
        const envelope = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as EncryptedEnvelope;
        const parsed = decryptJson<T>(envelope, this.key);
        this.data = parsed;
        this.mtimeMs = stat.mtimeMs;
        return parsed;
      }
      if (this.data === null) {
        this.data = this.defaultValue();
        this.write(this.data);
      }
      return this.data;
    } catch (e) {
      this.locked = true;
      throw new AuthError(
        `cannot read ${this.filePath} (${(e as Error).message}) — store LOCKED until fixed or removed on the host`,
        500,
      );
    }
  }

  protected write(data: T): void {
    if (this.locked) {
      throw new AuthError(`store unreadable — fix or remove ${this.filePath} on the host and restart`, 500);
    }
    this.data = data;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const envelope = encryptJson(data, this.key);
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(envelope), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    this.mtimeMs = fs.statSync(this.filePath).mtimeMs;
  }
}
