import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * AI-ANNOTATION
 * @ai-summary Builder credential store (Phase 9): a per-install service master
 *   key generated on FIRST RUN plus UI-managed API keys (create/revoke/rotate),
 *   persisted to a git-ignored builder-auth.json in the data dir. API keys are
 *   stored as sha256 hashes — the plaintext exists only in the create/rotate
 *   response. The master key is stored plaintext so the operator can read it
 *   off the host bind mount (single-operator project).
 * @ai-public AuthStore, AuthError, BuilderActor, ApiKeyInfo
 * @ai-notes A corrupt auth file LOCKS the builder (verify always fails) and is
 *   never overwritten — it may hold the only copy of the master key. Fix or
 *   remove it on the host and restart. Absent file = first run = fresh key.
 */

/** Expected auth failure with an HTTP status; routes map it via safe(). */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface ApiKeyRecord {
  id: string;
  label: string;
  sha256: string;
  createdAt: string;
  revokedAt?: string;
}

/** Public shape of a key — never includes the hash or any token material. */
export interface ApiKeyInfo {
  id: string;
  label: string;
  createdAt: string;
  revokedAt?: string;
}

/** Who a verified bearer token belongs to. */
export type BuilderActor = { kind: 'master' } | { kind: 'key'; id: string; label: string };

interface AuthFileData {
  masterKey: string;
  keys: ApiKeyRecord[];
}

const AUTH_FILE = 'builder-auth.json';

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time equality over same-length digests of the inputs. */
function tokensEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(sha256Hex(a)), Buffer.from(sha256Hex(b)));
}

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export class AuthStore {
  private readonly filePath: string;
  private data: AuthFileData | null = null;
  private locked = false;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, AUTH_FILE);
  }

  /**
   * Eagerly loads (or first-run creates) the auth file so the master key is
   * readable on the host as soon as the server boots — before any request.
   */
  init(): void {
    this.load();
  }

  /** mtime of the file backing the in-memory cache; 0 = nothing cached. */
  private mtimeMs = 0;

  /**
   * Phase 12b: the auth file used to live in backups/ beside the save backups.
   * On first load with the new auth/ dir, move a legacy file over (atomic
   * rename) so existing installs keep their keys.
   */
  private migrateLegacy(): void {
    const legacy = path.join(path.dirname(this.dataDir), 'backups', AUTH_FILE);
    if (path.resolve(legacy) === path.resolve(this.filePath) || !fs.existsSync(legacy)) return;
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.renameSync(legacy, this.filePath);
    console.log(`[auth] migrated ${legacy} -> ${this.filePath}`);
  }

  private load(): AuthFileData | null {
    if (this.locked) return this.data;
    try {
      if (!fs.existsSync(this.filePath)) this.migrateLegacy();
      if (fs.existsSync(this.filePath)) {
        // Re-read when the file changed on disk (generate-master-key.sh
        // rotation applies without a restart); otherwise serve the cache.
        const stat = fs.statSync(this.filePath);
        if (this.data !== null && stat.mtimeMs === this.mtimeMs) return this.data;
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as AuthFileData;
        if (typeof parsed.masterKey !== 'string' || parsed.masterKey.length === 0 || !Array.isArray(parsed.keys)) {
          throw new Error('malformed auth file');
        }
        this.data = parsed;
        this.mtimeMs = stat.mtimeMs;
      } else if (this.data === null) {
        this.data = { masterKey: newToken(), keys: [] };
        this.persist();
        console.log(`[auth] first run: generated a new builder master key at ${this.filePath}`);
      }
    } catch (e) {
      this.locked = true;
      console.error(
        `[auth] cannot read ${this.filePath} (${(e as Error).message}) — builder writes are LOCKED until the file is fixed or removed on the host`,
      );
    }
    return this.data;
  }

  private persist(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    this.mtimeMs = fs.statSync(this.filePath).mtimeMs;
  }

  private require(): AuthFileData {
    const data = this.load();
    if (!data) {
      throw new AuthError('auth store unreadable — fix or remove builder-auth.json on the host and restart', 500);
    }
    return data;
  }

  /** null = invalid, unknown, or revoked (also everything, when locked). */
  verify(token: string): BuilderActor | null {
    const data = this.load();
    if (!data || !token) return null;
    if (tokensEqual(token, data.masterKey)) return { kind: 'master' };
    const hash = Buffer.from(sha256Hex(token));
    for (const key of data.keys) {
      // length guard: timingSafeEqual THROWS on mismatched lengths (a hand-mangled record must not 500 every request)
      if (!key.revokedAt && key.sha256.length === hash.length && crypto.timingSafeEqual(hash, Buffer.from(key.sha256))) {
        return { kind: 'key', id: key.id, label: key.label };
      }
    }
    return null;
  }

  listKeys(): ApiKeyInfo[] {
    return this.require().keys.map((k) => ({
      id: k.id,
      label: k.label,
      createdAt: k.createdAt,
      ...(k.revokedAt ? { revokedAt: k.revokedAt } : {}),
    }));
  }

  /** The plaintext token is returned exactly once — only a hash is stored. */
  createKey(label: string): { id: string; label: string; token: string } {
    const data = this.require();
    const token = newToken();
    const record: ApiKeyRecord = {
      id: crypto.randomBytes(8).toString('hex'),
      label,
      sha256: sha256Hex(token),
      createdAt: new Date().toISOString(),
    };
    data.keys.push(record);
    this.persist();
    return { id: record.id, label: record.label, token };
  }

  /** New token for the same id/label; the old value stops verifying at once. */
  rotateKey(id: string): { id: string; label: string; token: string } {
    const data = this.require();
    const record = data.keys.find((k) => k.id === id);
    if (!record) throw new AuthError(`no API key with id ${JSON.stringify(id)}`, 404);
    if (record.revokedAt) throw new AuthError('revoked keys cannot be rotated — create a new key instead', 409);
    const token = newToken();
    record.sha256 = sha256Hex(token);
    this.persist();
    return { id: record.id, label: record.label, token };
  }

  /** Idempotent: revoking an already-revoked key keeps the first timestamp. */
  revokeKey(id: string): ApiKeyInfo {
    const data = this.require();
    const record = data.keys.find((k) => k.id === id);
    if (!record) throw new AuthError(`no API key with id ${JSON.stringify(id)}`, 404);
    record.revokedAt ??= new Date().toISOString();
    this.persist();
    return { id: record.id, label: record.label, createdAt: record.createdAt, revokedAt: record.revokedAt };
  }

  /** Replaces the master key; the old value stops verifying at once. */
  rotateMaster(): { token: string } {
    const data = this.require();
    const token = newToken();
    data.masterKey = token;
    this.persist();
    return { token };
  }
}
