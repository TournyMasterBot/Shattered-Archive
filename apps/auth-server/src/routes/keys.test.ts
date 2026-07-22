import { startTestApp, signupAndLogin, fullyOnboardedSession, type TestHarness } from './test-helpers.js';

describe('keys routes', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('requires a session', async () => {
    const res = await fetch(`${harness.base}/api/keys`);
    expect(res.status).toBe(401);
  });

  it('is blocked while mustChangePassword is set', async () => {
    const { cookie } = await signupAndLogin(harness.base, 'alice');
    const res = await fetch(`${harness.base}/api/keys`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(403);
  });

  it('creates a key, shows the token exactly once, and lists it without the token/hash', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'bob');

    const createRes = await fetch(`${harness.base}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ service: 'test-service', label: 'my key' }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; token: string; expiresAt: string | null };
    expect(typeof created.token).toBe('string');
    expect(created.expiresAt).toBeNull();

    const listRes = await fetch(`${harness.base}/api/keys`, { headers: { Cookie: cookie } });
    const list = (await listRes.json()) as { keys: Record<string, unknown>[] };
    expect(list.keys).toHaveLength(1);
    expect(list.keys[0]).not.toHaveProperty('token');
    expect(list.keys[0]).not.toHaveProperty('sha256');
  });

  it('rejects a past expiresAt', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'carol');
    const res = await fetch(`${harness.base}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ service: 'svc', label: 'l', expiresAt: new Date(Date.now() - 1000).toISOString() }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts a future expiresAt', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'dave');
    const res = await fetch(`${harness.base}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ service: 'svc', label: 'l', expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    });
    expect(res.status).toBe(201);
  });

  it('rotate issues a new token and the response is shown once', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'erin');
    const createRes = await fetch(`${harness.base}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ service: 'svc', label: 'l' }),
    });
    const created = (await createRes.json()) as { id: string; token: string };

    const rotateRes = await fetch(`${harness.base}/api/keys/${created.id}/rotate`, { method: 'POST', headers: { Cookie: cookie } });
    expect(rotateRes.status).toBe(200);
    const rotated = (await rotateRes.json()) as { token: string };
    expect(rotated.token).not.toBe(created.token);
  });

  it('DELETE revokes a key; a second delete is idempotent', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'frank');
    const createRes = await fetch(`${harness.base}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ service: 'svc', label: 'l' }),
    });
    const created = (await createRes.json()) as { id: string };

    const deleteRes = await fetch(`${harness.base}/api/keys/${created.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(deleteRes.status).toBe(200);
    const again = await fetch(`${harness.base}/api/keys/${created.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(again.status).toBe(200);
  });

  it('rotate/delete 404 for a key belonging to someone else', async () => {
    const cookieA = await fullyOnboardedSession(harness.base, 'gail');
    const cookieB = await fullyOnboardedSession(harness.base, 'hank');

    const createRes = await fetch(`${harness.base}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ service: 'svc', label: 'l' }),
    });
    const created = (await createRes.json()) as { id: string };

    const rotateAsB = await fetch(`${harness.base}/api/keys/${created.id}/rotate`, { method: 'POST', headers: { Cookie: cookieB } });
    expect(rotateAsB.status).toBe(404);
    const deleteAsB = await fetch(`${harness.base}/api/keys/${created.id}`, { method: 'DELETE', headers: { Cookie: cookieB } });
    expect(deleteAsB.status).toBe(404);
  });
});
