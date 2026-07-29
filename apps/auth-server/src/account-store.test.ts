import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { AccountStore, generateOneTimePassword } from './account-store.js';
import { AuthError } from './errors.js';

function makeStore(): { store: AccountStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'account-store-'));
  return { store: new AccountStore(dir, crypto.randomBytes(32)), dir };
}

describe('AccountStore', () => {
  let dir: string;
  let store: AccountStore;

  beforeEach(() => {
    ({ store, dir } = makeStore());
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates an account with mustChangePassword set and epoch 0', async () => {
    const account = await store.createAccount('alice', generateOneTimePassword());
    expect(account.epoch).toBe(0);
    expect(account.mustChangePassword).toBe(true);
    expect(account.usernameNormalized).toBe('alice');
  });

  it('rejects a duplicate username (case-insensitive)', async () => {
    await store.createAccount('alice', 'password-one-time-1');
    await expect(store.createAccount('ALICE', 'password-one-time-2')).rejects.toThrow(AuthError);
  });

  it('authenticate succeeds with correct credentials, fails otherwise', async () => {
    await store.createAccount('bob', 'one-time-password-xyz');
    expect(await store.authenticate('bob', 'one-time-password-xyz')).not.toBeNull();
    expect(await store.authenticate('bob', 'wrong-password')).toBeNull();
    expect(await store.authenticate('nobody', 'whatever')).toBeNull();
  });

  it('changePassword clears mustChangePassword and bumps epoch', async () => {
    const account = await store.createAccount('carol', 'temp-pass-1');
    const newEpoch = await store.changePassword(account.id, 'a brand new password');
    expect(newEpoch).toBe(1);
    const updated = store.require(account.id);
    expect(updated.mustChangePassword).toBe(false);
    expect(updated.epoch).toBe(1);
    expect(await store.authenticate('carol', 'a brand new password')).not.toBeNull();
    expect(await store.authenticate('carol', 'temp-pass-1')).toBeNull();
  });

  it('adminSetTemporaryPassword sets mustChangePassword AND bumps epoch (operator recovery invalidates old sessions)', async () => {
    const account = await store.createAccount('dave', 'first-pass');
    await store.changePassword(account.id, 'a real chosen password'); // epoch -> 1, mustChangePassword -> false
    await store.adminSetTemporaryPassword(account.id, 'operator-issued-temp');
    const updated = store.require(account.id);
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.epoch).toBe(2);
  });

  it('rotateEpoch bumps epoch without touching the password', async () => {
    const account = await store.createAccount('erin', 'first-pass');
    const before = store.require(account.id).passwordHash;
    const newEpoch = store.rotateEpoch(account.id);
    expect(newEpoch).toBe(1);
    expect(store.require(account.id).passwordHash).toBe(before);
  });

  it('email verification: requestEmail does not set email until verifyEmail succeeds', async () => {
    const account = await store.createAccount('frank', 'first-pass');
    const { token } = store.requestEmail(account.id, 'frank@example.com');
    expect(store.require(account.id).email).toBeUndefined();
    store.verifyEmail(account.id, token);
    const updated = store.require(account.id);
    expect(updated.email).toBe('frank@example.com');
    expect(updated.emailVerifiedAt).toBeDefined();
  });

  it('verifyEmail rejects a wrong token', async () => {
    const account = await store.createAccount('gail', 'first-pass');
    store.requestEmail(account.id, 'gail@example.com');
    expect(() => store.verifyEmail(account.id, 'not-the-real-token')).toThrow(AuthError);
  });

  it('requestPasswordReset returns null for an account with no verified email (anti-enumeration source of truth)', async () => {
    await store.createAccount('hank', 'first-pass');
    expect(store.requestPasswordReset('hank')).toBeNull();
    expect(store.requestPasswordReset('no-such-account')).toBeNull();
  });

  it('requestPasswordReset + resetPassword works once email is verified, and bumps epoch', async () => {
    const account = await store.createAccount('ivy', 'first-pass');
    const { token: emailToken } = store.requestEmail(account.id, 'ivy@example.com');
    store.verifyEmail(account.id, emailToken);

    const result = store.requestPasswordReset('ivy');
    expect(result).not.toBeNull();
    expect(result!.email).toBe('ivy@example.com');

    const epochBefore = store.require(account.id).epoch;
    await store.resetPassword(result!.token, 'a freshly reset password');
    const updated = store.require(account.id);
    expect(updated.epoch).toBe(epochBefore + 1);
    expect(await store.authenticate('ivy', 'a freshly reset password')).not.toBeNull();
  });

  it('resetPassword rejects an invalid or expired token', async () => {
    await expect(store.resetPassword('not-a-real-token', 'whatever new password')).rejects.toThrow(AuthError);
  });

  it('setGlobalRole stores a tier, and "user" clears back to the absent default', async () => {
    const account = await store.createAccount('rolanda', 'initial password 123');
    expect(store.require(account.id).globalRole).toBeUndefined();
    store.setGlobalRole(account.id, 'admin');
    expect(store.require(account.id).globalRole).toBe('admin');
    store.setGlobalRole(account.id, 'user');
    expect(store.require(account.id).globalRole).toBeUndefined();
  });

  it('setGlobalRole rejects an unknown tier with a 400', async () => {
    const account = await store.createAccount('rolf', 'initial password 123');
    expect(() => store.setGlobalRole(account.id, 'archmage')).toThrow(AuthError);
    try {
      store.setGlobalRole(account.id, 'archmage');
    } catch (e) {
      expect((e as AuthError).status).toBe(400);
    }
  });

  it('a corrupt/undecryptable file LOCKS the store rather than silently resetting it', () => {
    const filePath = path.join(dir, 'auth-accounts.json');
    fs.writeFileSync(filePath, JSON.stringify({ iv: 'x', authTag: 'y', ciphertext: 'z' }));
    expect(() => store.findByUsername('anyone')).toThrow(AuthError);
    // Locked stays locked on a second call too.
    expect(() => store.findByUsername('anyone')).toThrow(AuthError);
  });
});
