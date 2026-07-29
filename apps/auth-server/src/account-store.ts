import crypto from 'crypto';
import path from 'path';
import { promisify } from 'util';

import { EncryptedFileStore } from './encrypted-file-store.js';
import { AuthError } from './errors.js';
import { isGlobalTier, type GlobalTier } from './global-tiers.js';

/**
 * AI-ANNOTATION
 * @ai-summary Username accounts: scrypt password hashing, the epoch counter
 *   that both change-password and rotate-master bump (invalidating every
 *   issued key/session), the pending email-verify / password-reset token
 *   flows, and the Phase A hub-global tier (globalRole, absent = 'user').
 *   Persisted via EncryptedFileStore (AES-256-GCM at rest).
 * @ai-public AccountStore, AccountRecord, generateOneTimePassword
 * @ai-notes createAccount hashes BEFORE re-checking for a duplicate username,
 *   immediately before the synchronous read-modify-write — scrypt is slow
 *   enough (~50-100ms) that checking-then-hashing would leave a real
 *   concurrent-signup race window open.
 */

const scryptAsync = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

export interface AccountRecord {
  id: string;
  username: string;
  usernameNormalized: string;
  passwordHash: string; // hex
  passwordSalt: string; // hex
  epoch: number;
  mustChangePassword: boolean;
  createdAt: string;
  /** Phase A hub-global tier; absent = plain 'user' (the default for every account). */
  globalRole?: GlobalTier;
  email?: string;
  emailNormalized?: string;
  emailVerifiedAt?: string;
  pendingEmail?: { email: string; tokenSha256: string; expiresAt: string };
  pendingPasswordReset?: { tokenSha256: string; expiresAt: string };
}

interface AccountsFileData {
  accounts: AccountRecord[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** sha256 digests of equal length are compared in constant time; unequal lengths short-circuit (leaks nothing about either secret). */
function tokensMatch(candidate: string, storedSha256Hex: string): boolean {
  const a = Buffer.from(sha256Hex(candidate));
  const b = Buffer.from(storedSha256Hex);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function newToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return { hash: derived.toString('hex'), salt };
}

async function verifyPasswordHash(password: string, hash: string, salt: string): Promise<boolean> {
  const derived = await scryptAsync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  // length guard: timingSafeEqual THROWS on mismatched lengths
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

/**
 * Shared by the signup route and the issue-temp-password.ts host script, so
 * neither path can drift: a cryptographically random one-time password, never
 * an arbitrary/typed-in value.
 */
export function generateOneTimePassword(): string {
  return crypto.randomBytes(18).toString('base64url'); // 24 chars, URL-safe
}

export class AccountStore extends EncryptedFileStore<AccountsFileData> {
  constructor(dataDir: string, key: Buffer) {
    super(path.join(dataDir, 'auth-accounts.json'), key, () => ({ accounts: [] }));
  }

  private list(): AccountRecord[] {
    return this.read().accounts;
  }

  private persist(accounts: AccountRecord[]): void {
    this.write({ accounts });
  }

  findByUsername(username: string): AccountRecord | undefined {
    const wanted = normalize(username);
    return this.list().find((a) => a.usernameNormalized === wanted);
  }

  findById(id: string): AccountRecord | undefined {
    return this.list().find((a) => a.id === id);
  }

  /** Every account (full records — routes must map to public fields, never return these raw). */
  listAll(): AccountRecord[] {
    return [...this.list()];
  }

  require(id: string): AccountRecord {
    const account = this.findById(id);
    if (!account) throw new AuthError(`no account with id ${JSON.stringify(id)}`, 404);
    return account;
  }

  /** `password` is always the system-generated one-time password (see generateOneTimePassword) — this function just hashes+stores whatever it's given and sets mustChangePassword. */
  async createAccount(username: string, password: string): Promise<AccountRecord> {
    const usernameNormalized = normalize(username);
    const { hash, salt } = await hashPassword(password);

    const accounts = this.list();
    if (accounts.some((a) => a.usernameNormalized === usernameNormalized)) {
      throw new AuthError('that username is already taken', 409);
    }
    const record: AccountRecord = {
      id: crypto.randomBytes(12).toString('hex'),
      username,
      usernameNormalized,
      passwordHash: hash,
      passwordSalt: salt,
      epoch: 0,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    };
    accounts.push(record);
    this.persist(accounts);
    return record;
  }

  /** Returns the account on a matching username+password, null otherwise (never distinguishes which was wrong). */
  async authenticate(username: string, password: string): Promise<AccountRecord | null> {
    const account = this.findByUsername(username);
    if (!account) return null;
    const ok = await verifyPasswordHash(password, account.passwordHash, account.passwordSalt);
    return ok ? account : null;
  }

  /** Same check as authenticate(), keyed by an already-known account id — used by change-password to prove possession of the CURRENT password before applying a new one. */
  async verifyPasswordFor(accountId: string, password: string): Promise<boolean> {
    const account = this.require(accountId);
    return verifyPasswordHash(password, account.passwordHash, account.passwordSalt);
  }

  /** Self-service change-password AND the reset-password flow both land here. Always bumps epoch (Constraints: a changed password invalidates every prior key/session, no exceptions). */
  async changePassword(accountId: string, newPassword: string): Promise<number> {
    const account = this.require(accountId);
    const { hash, salt } = await hashPassword(newPassword);
    account.passwordHash = hash;
    account.passwordSalt = salt;
    account.mustChangePassword = false;
    account.epoch += 1;
    this.persist(this.list());
    return account.epoch;
  }

  /**
   * Operator recovery path (scripts/issue-temp-password.ts, host-run only —
   * never an HTTP route). Same shape as a password change but the caller
   * never proved the OLD password, so it also bumps epoch: an account being
   * recovered this way must not leave a stale session/key usable afterward.
   */
  async adminSetTemporaryPassword(accountId: string, temporaryPassword: string): Promise<void> {
    const account = this.require(accountId);
    const { hash, salt } = await hashPassword(temporaryPassword);
    account.passwordHash = hash;
    account.passwordSalt = salt;
    account.mustChangePassword = true;
    account.epoch += 1;
    this.persist(this.list());
  }

  /**
   * Host-script only in Phase A (grant-tier.ts / revoke-tier.ts) — the
   * strictly-below-managed HTTP admin surface arrives in Phase A2. Setting
   * 'user' removes the field (absent = the default tier).
   */
  setGlobalRole(accountId: string, tier: string): void {
    if (!isGlobalTier(tier)) {
      throw new AuthError(`unknown global tier ${JSON.stringify(tier)}`, 400);
    }
    const account = this.require(accountId);
    if (tier === 'user') {
      delete account.globalRole;
    } else {
      account.globalRole = tier;
    }
    this.persist(this.list());
  }

  /** Standalone "I think a key leaked, my password is fine" trigger — no password change. */
  rotateEpoch(accountId: string): number {
    const account = this.require(accountId);
    account.epoch += 1;
    this.persist(this.list());
    return account.epoch;
  }

  /** Sets pendingEmail; does NOT touch email/emailVerifiedAt yet. Plaintext token returned once, for the mailer. */
  requestEmail(accountId: string, email: string): { token: string } {
    const account = this.require(accountId);
    const token = newToken();
    account.pendingEmail = {
      email,
      tokenSha256: sha256Hex(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
    };
    this.persist(this.list());
    return { token };
  }

  verifyEmail(accountId: string, token: string): void {
    const account = this.require(accountId);
    const pending = account.pendingEmail;
    if (!pending || Date.now() > Date.parse(pending.expiresAt)) {
      throw new AuthError('no pending email verification, or it expired', 400);
    }
    if (!tokensMatch(token, pending.tokenSha256)) {
      throw new AuthError('invalid verification token', 400);
    }
    account.email = pending.email;
    account.emailNormalized = normalize(pending.email);
    account.emailVerifiedAt = new Date().toISOString();
    delete account.pendingEmail;
    this.persist(this.list());
  }

  /**
   * Returns null if the account doesn't exist OR has no verified email — the
   * ROUTE must respond identically either way (generic "if that account can
   * receive a reset link, one was sent") to avoid a username/email
   * enumeration oracle. Plaintext token returned once, for the mailer.
   */
  requestPasswordReset(username: string): { email: string; token: string } | null {
    const account = this.findByUsername(username);
    if (!account || !account.email || !account.emailVerifiedAt) return null;
    const token = newToken();
    account.pendingPasswordReset = {
      tokenSha256: sha256Hex(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
    };
    this.persist(this.list());
    return { email: account.email, token };
  }

  /** Validates the reset token across all accounts, applies via changePassword (bumps epoch), clears pendingPasswordReset. Does NOT auto-login — the route never had a session to begin with. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const accounts = this.list();
    const account = accounts.find((a) => a.pendingPasswordReset && tokensMatch(token, a.pendingPasswordReset.tokenSha256));
    if (!account || Date.now() > Date.parse(account.pendingPasswordReset!.expiresAt)) {
      throw new AuthError('invalid or expired reset token', 400);
    }
    delete account.pendingPasswordReset;
    this.persist(accounts);
    await this.changePassword(account.id, newPassword);
  }
}
