import fs from 'fs';
import os from 'os';
import path from 'path';

import { consumeAccessCode, isExpired, isValidCode, mintAccessCode } from './access-codes.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'simulacrum-access-codes-'));
}

describe('access-codes', () => {
  it('mints a code and consumes it exactly once', () => {
    const dir = tmpDir();
    const code = mintAccessCode(dir, 'acct-1', 'alice', 5 * 60 * 1000);
    expect(isValidCode(code)).toBe(true);

    const record = consumeAccessCode(dir, code);
    expect(record).toEqual({ accountId: 'acct-1', username: 'alice', expiresAt: expect.any(String) });

    // Single-use: the same code fails the second time.
    expect(consumeAccessCode(dir, code)).toBeNull();
  });

  it('rejects an unknown code without throwing', () => {
    const dir = tmpDir();
    expect(consumeAccessCode(dir, 'not-a-real-code-00000000000000')).toBeNull();
  });

  it('rejects a malformed code without touching the filesystem', () => {
    const dir = tmpDir();
    expect(consumeAccessCode(dir, '../../etc/passwd')).toBeNull();
    expect(consumeAccessCode(dir, '')).toBeNull();
  });

  it('rejects an expired code and still consumes (deletes) it', () => {
    const dir = tmpDir();
    const code = mintAccessCode(dir, 'acct-1', 'alice', -1000); // already expired
    expect(consumeAccessCode(dir, code)).toBeNull();
    // Confirms the expired file was removed, not left around for a retry.
    expect(consumeAccessCode(dir, code)).toBeNull();
  });

  it('isExpired compares against the provided "now"', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isExpired({ expiresAt: future }, new Date())).toBe(false);
    expect(isExpired({ expiresAt: future }, new Date(Date.now() + 120_000))).toBe(true);
    expect(isExpired({ expiresAt: 'not-a-date' })).toBe(true);
  });
});
