import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * AI-ANNOTATION
 * @ai-summary Shared crypto foundation for auth-server: AES-256-GCM at-rest
 *   envelopes (encryptJson/decryptJson) keyed by loadDataKey()'s external-key
 *   precedence, and Ed25519 helpers (generateServiceKeypair/signAssertion/
 *   verifyAssertion) for the service-to-service introspect guard (step 6).
 * @ai-public EncryptedEnvelope, encryptJson, decryptJson, loadDataKey,
 *   generateServiceKeypair, signAssertion, verifyAssertion
 * @ai-notes Threat model: protects a stolen DISK IMAGE OR BACKUP taken without
 *   the key. Does NOT protect a running-process/host compromise (the process
 *   must decrypt its own data unattended, same as any single-host at-rest
 *   scheme) and does NOT provide forward secrecy — there is no key exchange
 *   here, just one process encrypting its own data.
 */

export interface EncryptedEnvelope {
  iv: string; // base64, 12 bytes
  authTag: string; // base64
  ciphertext: string; // base64
}

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

export function encryptJson(data: unknown, key: Buffer): EncryptedEnvelope {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/**
 * Throws on a bad auth tag or malformed envelope — treat exactly like
 * auth-store.ts's "corrupt file locks the store": never silently fall back to
 * empty state, since that would mask tampering or a wrong/lost key.
 */
export function decryptJson<T>(envelope: EncryptedEnvelope, key: Buffer): T {
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

function isValidHexKey(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

/**
 * Precedence: (1) DATA_ENCRYPTION_KEY env var — local dev/test, or an operator
 * managing the key externally by their own means; (2) DATA_ENCRYPTION_KEY_FILE,
 * read if it exists; (3) DATA_ENCRYPTION_KEY_FILE set but the file doesn't
 * exist yet AND its parent directory does (first boot against a fresh mounted
 * volume — see deploy/docker-compose*.yml) — self-generate, write atomically,
 * chmod 0o600, log ONE line (never the key value); (4) throw. Case (3) is
 * deliberately analogous to mud-builder's builder-auth.json
 * generate-on-first-run precedent, scoped to just this one key file.
 */
export function loadDataKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const envKey = env.DATA_ENCRYPTION_KEY;
  if (envKey) {
    if (!isValidHexKey(envKey)) {
      throw new Error('DATA_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    }
    return Buffer.from(envKey, 'hex');
  }

  const keyFile = env.DATA_ENCRYPTION_KEY_FILE;
  if (keyFile) {
    if (fs.existsSync(keyFile)) {
      const contents = fs.readFileSync(keyFile, 'utf8').trim();
      if (!isValidHexKey(contents)) {
        throw new Error(`${keyFile} does not contain a valid 64 hex character key`);
      }
      return Buffer.from(contents, 'hex');
    }
    const dir = path.dirname(keyFile);
    if (fs.existsSync(dir)) {
      const generated = crypto.randomBytes(32).toString('hex');
      const tmp = `${keyFile}.tmp`;
      fs.writeFileSync(tmp, generated, { mode: 0o600 });
      fs.renameSync(tmp, keyFile);
      fs.chmodSync(keyFile, 0o600);
      // boot-time notice, deliberately never logs the key value itself
      console.log(`[auth-server] first boot: generated a new data encryption key at ${keyFile}`);
      return Buffer.from(generated, 'hex');
    }
  }

  throw new Error(
    'no usable data encryption key: set DATA_ENCRYPTION_KEY (64 hex chars) or DATA_ENCRYPTION_KEY_FILE pointing at a mounted, writable directory',
  );
}

export function generateServiceKeypair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

/**
 * Re-exports an Ed25519 public key PEM in this process's own canonical SPKI form,
 * or returns null if it is not a usable Ed25519 public key.
 *
 * Exists for the service-registry reconciler, which compares a PEM written by a
 * DIFFERENT runtime (the C# service's BouncyCastle writer, via the shared public-key
 * directory) against one already stored here. Those two agree on the DER but not
 * necessarily on the text around it — line width, CRLF vs LF, a trailing newline. A
 * raw string compare would therefore see every boot as "a new key", re-registering
 * forever and never converging, which is exactly what an idempotent reconciler must
 * not do. Comparing canonical forms compares the KEY, not its formatting.
 *
 * Doubles as validation: anything that is not an Ed25519 public key (a truncated
 * file caught mid-write, a private key published by mistake, junk) returns null
 * rather than throwing, so one bad file cannot take down the reconcile pass.
 */
export function canonicalizePublicKeyPem(pem: string): string | null {
  // Rejected BEFORE parsing, because crypto.createPublicKey() accepts a PRIVATE key PEM
  // and silently DERIVES the public half from it. That would make a private key
  // mistakenly published into the shared public-key directory look perfectly valid —
  // registering fine while secret material sits readable in a volume that is only ever
  // supposed to carry public keys. The one thing this directory must never accept is the
  // thing it would otherwise accept quietly.
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(pem)) return null;
  if (!/-----BEGIN PUBLIC KEY-----/.test(pem)) return null;
  try {
    const key = crypto.createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') return null;
    return key.export({ type: 'spki', format: 'pem' }).toString();
  } catch {
    return null;
  }
}

/** Compact base64url(payloadJson) + '.' + base64url(signature) — JWT-shaped, hand-rolled, no JWT library. */
export function signAssertion(payload: object, privateKeyPem: string): string {
  const payloadJson = Buffer.from(JSON.stringify(payload), 'utf8');
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, payloadJson, privateKey); // Ed25519 needs no digest algorithm argument
  return `${payloadJson.toString('base64url')}.${signature.toString('base64url')}`;
}

/** Returns the decoded payload on a valid signature, null on ANY failure (malformed, wrong key, etc). */
export function verifyAssertion(compact: string, publicKeyPem: string): Record<string, unknown> | null {
  const parts = compact.split('.');
  if (parts.length !== 2) return null;
  const [payloadPart, signaturePart] = parts;
  try {
    const payloadJson = Buffer.from(payloadPart, 'base64url');
    const signature = Buffer.from(signaturePart, 'base64url');
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const ok = crypto.verify(null, payloadJson, publicKey, signature);
    if (!ok) return null;
    return JSON.parse(payloadJson.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
