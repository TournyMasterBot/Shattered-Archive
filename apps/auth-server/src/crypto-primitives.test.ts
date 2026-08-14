import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  encryptJson,
  decryptJson,
  loadDataKey,
  generateServiceKeypair,
  signAssertion,
  verifyAssertion,
} from './crypto-primitives.js';

function randomKey(): Buffer {
  return crypto.randomBytes(32);
}

describe('encryptJson/decryptJson', () => {
  it('round-trips arbitrary JSON data', () => {
    const key = randomKey();
    const data = { hello: 'world', nested: { n: 42, list: [1, 2, 3] } };
    const envelope = encryptJson(data, key);
    expect(decryptJson(envelope, key)).toEqual(data);
  });

  it('uses a fresh IV per write (never reused)', () => {
    const key = randomKey();
    const a = encryptJson({ x: 1 }, key);
    const b = encryptJson({ x: 1 }, key);
    expect(a.iv).not.toBe(b.iv);
  });

  it('rejects a tampered ciphertext (bad auth tag) instead of silently returning garbage', () => {
    const key = randomKey();
    const envelope = encryptJson({ secret: 'value' }, key);
    const tampered = { ...envelope, ciphertext: Buffer.from('tampered-bytes-here').toString('base64') };
    expect(() => decryptJson(tampered, key)).toThrow();
  });

  it('rejects decryption with the wrong key', () => {
    const envelope = encryptJson({ secret: 'value' }, randomKey());
    expect(() => decryptJson(envelope, randomKey())).toThrow();
  });
});

describe('loadDataKey', () => {
  it('uses DATA_ENCRYPTION_KEY when set and valid', () => {
    const hex = randomKey().toString('hex');
    const key = loadDataKey({ DATA_ENCRYPTION_KEY: hex } as NodeJS.ProcessEnv);
    expect(key.toString('hex')).toBe(hex);
  });

  it('rejects a malformed DATA_ENCRYPTION_KEY', () => {
    expect(() => loadDataKey({ DATA_ENCRYPTION_KEY: 'not-hex' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('reads an existing DATA_ENCRYPTION_KEY_FILE', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-key-'));
    const filePath = path.join(dir, 'encryption.key');
    const hex = randomKey().toString('hex');
    fs.writeFileSync(filePath, hex);
    const key = loadDataKey({ DATA_ENCRYPTION_KEY_FILE: filePath } as NodeJS.ProcessEnv);
    expect(key.toString('hex')).toBe(hex);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('self-generates the key file on first boot when the parent directory exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-key-gen-'));
    const filePath = path.join(dir, 'encryption.key');
    expect(fs.existsSync(filePath)).toBe(false);

    const key = loadDataKey({ DATA_ENCRYPTION_KEY_FILE: filePath } as NodeJS.ProcessEnv);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(key.length).toBe(32);

    // Second boot reuses the SAME generated file rather than regenerating.
    const again = loadDataKey({ DATA_ENCRYPTION_KEY_FILE: filePath } as NodeJS.ProcessEnv);
    expect(again.toString('hex')).toBe(key.toString('hex'));

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws when neither source yields a usable key', () => {
    expect(() => loadDataKey({} as NodeJS.ProcessEnv)).toThrow();
  });

  it('throws when DATA_ENCRYPTION_KEY_FILE is missing AND its parent directory does not exist either', () => {
    expect(() =>
      loadDataKey({ DATA_ENCRYPTION_KEY_FILE: '/no/such/directory/at/all/encryption.key' } as NodeJS.ProcessEnv),
    ).toThrow();
  });
});

describe('signAssertion/verifyAssertion', () => {
  it('round-trips a payload with a matching keypair', () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    const payload = { service: 'test-service', iat: Date.now(), exp: Date.now() + 1000, nonce: 'abc123' };
    const compact = signAssertion(payload, privateKeyPem);
    expect(verifyAssertion(compact, publicKeyPem)).toEqual(payload);
  });

  it('rejects a signature verified against a DIFFERENT keypair', () => {
    const signer = generateServiceKeypair();
    const other = generateServiceKeypair();
    const compact = signAssertion({ service: 'x', iat: 1, exp: 2, nonce: 'n' }, signer.privateKeyPem);
    expect(verifyAssertion(compact, other.publicKeyPem)).toBeNull();
  });

  it('rejects malformed compact strings', () => {
    const { publicKeyPem } = generateServiceKeypair();
    expect(verifyAssertion('not-a-valid-assertion', publicKeyPem)).toBeNull();
    expect(verifyAssertion('a.b.c', publicKeyPem)).toBeNull();
  });
});
