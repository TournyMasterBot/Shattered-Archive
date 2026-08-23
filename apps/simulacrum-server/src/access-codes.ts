import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * AI-ANNOTATION
 * @ai-summary Single-use, short-lived access codes gating every simulacrum connection
 *   (.ai-plans/20260816-0701-simulacrum-mud-wiring.md Step 1). Plain `key: value` text
 *   files, one per code, mirroring merc-mud's own state_snapshot.c file-handshake
 *   convention (tmp-then-rename atomic write) even though nothing on the C side reads
 *   these — kept consistent since the follow-on plan's preamble mechanism lives right
 *   next to this same idiom.
 * @ai-public mintAccessCode, consumeAccessCode, AccessCodeRecord
 * @ai-notes The code itself is the only secret — 16 random bytes, base64url-encoded
 *   (~128 bits), so brute-forcing a valid code within its few-minute TTL is infeasible
 *   even across many parallel relay connections. isValidCode() is checked BEFORE ever
 *   building a filesystem path from caller input — a malformed code must never reach
 *   path.join with untrusted characters.
 */

export interface AccessCodeRecord {
  accountId: string;
  username: string;
  expiresAt: string;
}

const CODE_BYTES = 16;
/** base64url alphabet only — safe to embed directly in a filename with no further escaping. */
const VALID_CODE = /^[A-Za-z0-9_-]{16,64}$/;

export function isValidCode(code: string): boolean {
  return VALID_CODE.test(code);
}

function codeFilePath(dir: string, code: string): string {
  if (!isValidCode(code)) throw new Error('invalid access code format');
  return path.join(dir, `${code}.txt`);
}

function serialize(record: AccessCodeRecord): string {
  return `accountId: ${record.accountId}\nusername: ${record.username}\nexpiresAt: ${record.expiresAt}\n`;
}

function parse(content: string): AccessCodeRecord | null {
  const lines = content.split('\n');
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  if (!fields.accountId || !fields.username || !fields.expiresAt) return null;
  return { accountId: fields.accountId, username: fields.username, expiresAt: fields.expiresAt };
}

/** True when `expiresAt` (ISO timestamp) is still in the future relative to `now`. */
export function isExpired(record: Pick<AccessCodeRecord, 'expiresAt'>, now: Date = new Date()): boolean {
  const expiresAtMs = Date.parse(record.expiresAt);
  return Number.isNaN(expiresAtMs) || expiresAtMs <= now.getTime();
}

/** Generates a fresh single-use code, writes its record to `<dir>/<code>.txt`, and returns the code. */
export function mintAccessCode(dir: string, accountId: string, username: string, ttlMs: number): string {
  const code = crypto.randomBytes(CODE_BYTES).toString('base64url');
  const record: AccessCodeRecord = { accountId, username, expiresAt: new Date(Date.now() + ttlMs).toISOString() };
  fs.mkdirSync(dir, { recursive: true });
  const filePath = codeFilePath(dir, code);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, serialize(record), { mode: 0o600 });
  fs.renameSync(tmp, filePath);
  return code;
}

/**
 * Validates and, on success, CONSUMES (deletes) a code — single-use by construction. Returns
 * null for a missing, malformed, or expired code; never throws on caller-supplied input.
 */
export function consumeAccessCode(dir: string, code: string): AccessCodeRecord | null {
  if (!isValidCode(code)) return null;
  const filePath = codeFilePath(dir, code);
  let record: AccessCodeRecord | null;
  try {
    record = parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
  // Always remove a code file once read, valid or not — a malformed/expired code must not
  // remain guessable/retryable, and a valid one is single-use regardless.
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Another consumer already removed it (race) — treat as "not found" below.
  }
  if (!record || isExpired(record)) return null;
  return record;
}
