import fs from 'fs';
import path from 'path';

import { startTestApp, fullyOnboardedSession, type TestHarness } from './test-helpers.js';

describe('/api/admin', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  async function onboard(username: string, tier: 'owner' | 'admin' | 'moderator' | 'user' = 'user'): Promise<{ cookie: string; id: string }> {
    const cookie = await fullyOnboardedSession(harness.base, username);
    const meRes = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: cookie } });
    const { id } = (await meRes.json()) as { id: string };
    if (tier !== 'user') harness.deps.accountStore.setGlobalRole(id, tier);
    return { cookie, id };
  }

  const listUsers = (cookie: string, qs = '') =>
    fetch(`${harness.base}/api/admin/users${qs}`, { headers: { Cookie: cookie } });
  const setRole = (cookie: string, id: string, role: string) =>
    fetch(`${harness.base}/api/admin/users/${id}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ role }),
    });
  const tempPassword = (cookie: string, id: string) =>
    fetch(`${harness.base}/api/admin/users/${id}/temp-password`, { method: 'POST', headers: { Cookie: cookie } });

  it('a plain user is 403 on every admin route, list included; no session is 401', async () => {
    const plain = await onboard('plainuser');
    expect((await listUsers(plain.cookie)).status).toBe(403);
    expect((await setRole(plain.cookie, plain.id, 'user')).status).toBe(403);
    expect((await tempPassword(plain.cookie, plain.id)).status).toBe(403);
    expect((await fetch(`${harness.base}/api/admin/services`, { headers: { Cookie: plain.cookie } })).status).toBe(403);
    expect((await listUsers('')).status).toBe(401);
  });

  it('the list marks manageability by the strictly-below rule and reveals no secret material', async () => {
    const moderator = await onboard('modone', 'moderator');
    await onboard('adminone', 'admin');
    await onboard('plainone');

    const res = await listUsers(moderator.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: { username: string; globalRole: string; manageable: boolean; counts: Record<string, number> }[];
      total: number;
      assignableTiers: string[];
    };
    expect(body.total).toBe(3);
    expect(body.assignableTiers).toEqual(['user']); // strictly below moderator

    const byName = Object.fromEntries(body.users.map((u) => [u.username, u]));
    expect(byName.adminone.manageable).toBe(false); // above the actor
    expect(byName.modone.manageable).toBe(false); // peer/self refuses
    expect(byName.plainone.manageable).toBe(true);
    expect(byName.plainone.counts.session).toBeGreaterThanOrEqual(1); // live session counted

    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/passwordHash|passwordSalt|sha256|token/);
  });

  it('enforces the strictly-below matrix on role assignment', async () => {
    const owner = await onboard('rootowner', 'owner');
    const admin = await onboard('admintwo', 'admin');
    const peerAdmin = await onboard('adminthree', 'admin');
    const plain = await onboard('plaintwo');

    // admin: may assign moderator to a lesser account…
    expect((await setRole(admin.cookie, plain.id, 'moderator')).status).toBe(200);
    // …but never a tier at/above their own,
    expect((await setRole(admin.cookie, plain.id, 'admin')).status).toBe(403);
    // never a peer,
    expect((await setRole(admin.cookie, peerAdmin.id, 'user')).status).toBe(403);
    // never upward, never self.
    expect((await setRole(admin.cookie, owner.id, 'user')).status).toBe(403);
    expect((await setRole(admin.cookie, admin.id, 'moderator')).status).toBe(403);

    // owner: may appoint admins, but owner itself is never assignable over HTTP.
    expect((await setRole(owner.cookie, plain.id, 'admin')).status).toBe(200);
    expect((await setRole(owner.cookie, plain.id, 'owner')).status).toBe(403);

    // demotion back to plain user by a sufficient actor works.
    const demote = await setRole(owner.cookie, plain.id, 'user');
    expect(demote.status).toBe(200);
    expect(((await demote.json()) as { globalRole: string }).globalRole).toBe('user');

    // unknown target id is a 404 (existence of listed accounts isn't secret; junk ids are).
    expect((await setRole(owner.cookie, 'no-such-id', 'user')).status).toBe(404);
  });

  it('temp-password recovers a lesser account: shown once, forces change, kills prior sessions, audits', async () => {
    const admin = await onboard('adminfour', 'admin');
    const target = await onboard('recoveree');

    const res = await tempPassword(admin.cookie, target.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { temporaryPassword: string };
    expect(typeof body.temporaryPassword).toBe('string');

    // Prior session died with the epoch bump.
    const meAfter = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: target.cookie } });
    expect(meAfter.status).toBe(401);

    // Logging in with the temp password lands in mustChangePassword.
    const login = await fetch(`${harness.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'recoveree', password: body.temporaryPassword }),
    });
    expect(login.status).toBe(200);
    expect(((await login.json()) as { mustChangePassword: boolean }).mustChangePassword).toBe(true);

    // Both admin actions from this suite family land in the audit log.
    const audit = fs.readFileSync(path.join(harness.dir, 'audit.log'), 'utf8');
    expect(audit).toContain('"action":"temp-password"');
    expect(audit).toContain('"targetUsername":"recoveree"');
  });

  it('search + paging: query filters, offset/limit slice, total reflects the filter', async () => {
    const admin = await onboard('adminfive', 'admin');
    await onboard('carolina');
    await onboard('caroline');
    await onboard('dorothea');

    const filtered = (await (await listUsers(admin.cookie, '?query=carol')).json()) as { users: { username: string }[]; total: number };
    expect(filtered.total).toBe(2);
    expect(filtered.users.map((u) => u.username)).toEqual(['carolina', 'caroline']);

    const paged = (await (await listUsers(admin.cookie, '?query=carol&offset=1&limit=1')).json()) as { users: { username: string }[]; total: number };
    expect(paged.total).toBe(2);
    expect(paged.users.map((u) => u.username)).toEqual(['caroline']);
  });

  it('live counts drop when a credential is revoked', async () => {
    const admin = await onboard('adminsix', 'admin');
    const target = await onboard('keyedup');
    const account = harness.deps.accountStore.require(target.id);
    const { id: keyId } = harness.deps.keyStore.mintApiKey(target.id, 'svc', 'k', null, account.epoch);

    const before = (await (await listUsers(admin.cookie, '?query=keyedup')).json()) as { users: { counts: Record<string, number> }[] };
    expect(before.users[0].counts.api).toBe(1);

    harness.deps.keyStore.revokeById(keyId);
    const after = (await (await listUsers(admin.cookie, '?query=keyedup')).json()) as { users: { counts: Record<string, number> }[] };
    expect(after.users[0].counts.api).toBe(0);
  });

  it('the services listing feeds the delegation surface', async () => {
    const admin = await onboard('adminseven', 'admin');
    const { generateServiceKeypair } = await import('../crypto-primitives.js');
    const { publicKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('some-consumer', publicKeyPem);
    harness.deps.serviceKeyStore.addRedirectUri('some-consumer', 'https://consumer.example/cb');

    const res = await fetch(`${harness.base}/api/admin/services`, { headers: { Cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const { services } = (await res.json()) as { services: { serviceName: string; activeKeys: number; redirectUris: string[] }[] };
    expect(services).toEqual([{ serviceName: 'some-consumer', activeKeys: 1, redirectUris: ['https://consumer.example/cb'] }]);
  });

  it('/api/auth/me now reports globalRole additively', async () => {
    const admin = await onboard('admineight', 'admin');
    const me = (await (await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: admin.cookie } })).json()) as { globalRole: string };
    expect(me.globalRole).toBe('admin');
  });
});
