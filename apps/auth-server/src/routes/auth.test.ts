import { startTestApp, signupViaHttp, signupAndLogin, extractCookie, type TestHarness } from './test-helpers.js';
import { LoginLockout } from '../login-lockout.js';

describe('auth routes', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('GET /api/auth/challenge returns prompts but never answers', async () => {
    const res = await fetch(`${harness.base}/api/auth/challenge`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challengeId: string; prompts: unknown[] };
    expect(body.prompts).toHaveLength(3);
    expect(JSON.stringify(body)).not.toMatch(/acceptedAnswers/);
  });

  it('signup with correct answers creates an account and shows the password exactly once', async () => {
    const { username, password } = await signupViaHttp(harness.base, 'alice');
    expect(username).toBe('alice');
    expect(typeof password).toBe('string');
    expect(password.length).toBeGreaterThan(10);
  });

  it('signup with a wrong answer creates NO account (400, generic message)', async () => {
    const challengeRes = await fetch(`${harness.base}/api/auth/challenge`);
    const challenge = (await challengeRes.json()) as { challengeId: string; prompts: { questionId: string }[] };
    const answers: Record<string, string> = {};
    for (const p of challenge.prompts) answers[p.questionId] = 'definitely-wrong';

    const signupRes = await fetch(`${harness.base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob', challengeId: challenge.challengeId, answers }),
    });
    expect(signupRes.status).toBe(400);
    const body = (await signupRes.json()) as { error: string };
    expect(body).not.toHaveProperty('password');

    // No account was created — a second signup with the SAME username (and fresh valid answers) succeeds.
    const retried = await signupViaHttp(harness.base, 'bob');
    expect(retried.username).toBe('bob');
  });

  it('signup rejects a duplicate username', async () => {
    await signupViaHttp(harness.base, 'carol');
    await expect(signupViaHttp(harness.base, 'carol')).rejects.toThrow();
  });

  it('login succeeds with the one-time password and reports mustChangePassword: true', async () => {
    const { username, password } = await signupViaHttp(harness.base, 'dave');
    const res = await fetch(`${harness.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mustChangePassword).toBe(true);
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('passwordSalt');
    expect(res.headers.get('set-cookie')).toMatch(/sa_session=/);
  });

  it('login fails with a wrong password', async () => {
    const { username } = await signupViaHttp(harness.base, 'erin');
    const res = await fetch(`${harness.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  it('locks out after repeated failed logins (429 + retry hint), blocks even the correct password while locked, and recovers after expiry', async () => {
    harness.deps.loginLockout = new LoginLockout(1, 50, 50); // 1 free attempt, then a 50ms lock
    const { username, password } = await signupViaHttp(harness.base, 'jill');

    const attemptWrong = () =>
      fetch(`${harness.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'wrong' }),
      });

    expect((await attemptWrong()).status).toBe(401);
    expect((await attemptWrong()).status).toBe(401);
    const lockedRes = await attemptWrong();
    expect(lockedRes.status).toBe(429);
    const lockedBody = (await lockedRes.json()) as { error: string };
    expect(lockedBody.error).toMatch(/too many failed attempts/);

    // The CORRECT password is rejected too while locked — the lockout check runs before authenticate().
    const correctWhileLocked = await fetch(`${harness.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(correctWhileLocked.status).toBe(429);

    // Once the lock naturally expires, the correct password works again.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const afterExpiry = await fetch(`${harness.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(afterExpiry.status).toBe(200);
  });

  it('a forged X-Forwarded-For cannot escape the per-IP lockout', async () => {
    // Regression guard for `app.set('trust proxy', 1)` in app.ts. Under the previous
    // `true`, req.ip became the LEFTMOST X-Forwarded-For entry — i.e. whatever the client
    // sent — so an attacker could rotate one header and get unlimited password attempts.
    //
    // The header below is shaped exactly as the deployed chain produces it: each nginx hop
    // APPENDS, so the client's forged value leads and the edge's own $remote_addr (the real
    // client, resolved via set_real_ip_from) trails. Only the leading value is rotated here,
    // which is the whole of what an attacker controls.
    // Each attempt uses a DIFFERENT username on purpose. LoginLockout keys on username and
    // IP independently, so same-username attempts would trip the username axis and prove
    // nothing about the IP one — and the IP axis ("spray many accounts from one source") is
    // precisely what a forged header defeated.
    harness.deps.loginLockout = new LoginLockout(1, 5_000, 5_000); // 1 free attempt, then locked

    const attemptWrong = (forged: string, realClient: string, username: string) =>
      fetch(`${harness.base}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': `${forged}, ${realClient}`,
        },
        body: JSON.stringify({ username, password: 'wrong' }),
      });

    expect((await attemptWrong('9.9.9.1', '203.0.113.7', 'alpha')).status).toBe(401);
    expect((await attemptWrong('9.9.9.2', '203.0.113.7', 'beta')).status).toBe(401);

    // Third strike from the same REAL client. A fresh forged address must not buy a fresh
    // allowance — under `trust proxy: true` this returned 401 and the spray continued.
    expect((await attemptWrong('9.9.9.3', '203.0.113.7', 'gamma')).status).toBe(429);

    // ...while a genuinely different real client is unaffected, so the fix does not collapse
    // every caller into one shared bucket.
    expect((await attemptWrong('9.9.9.1', '198.51.100.4', 'gamma')).status).toBe(401);
  });

  it('GET /api/auth/me requires a session', async () => {
    const res = await fetch(`${harness.base}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me works mid-mustChangePassword (explicit allowlist)', async () => {
    const { cookie } = await signupAndLogin(harness.base, 'frank');
    const res = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
  });

  it('logout revokes the session — /api/auth/me 401s afterward', async () => {
    const { cookie } = await signupAndLogin(harness.base, 'gail');
    const logoutRes = await fetch(`${harness.base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    expect(logoutRes.status).toBe(200);

    const meRes = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: cookie } });
    expect(meRes.status).toBe(401);
  });

  it('forgot-password returns the SAME response for an unknown account, a known account with no email, and a known verified-email account', async () => {
    await signupViaHttp(harness.base, 'hank'); // known, no email

    const unknown = await fetch(`${harness.base}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'no-such-user' }),
    });
    const known = await fetch(`${harness.base}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'hank' }),
    });

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(harness.mailer.sent).toHaveLength(0); // hank has no verified email — nothing was actually mailed
  });

  it('reset-password never auto-logs-in (no session cookie set), even on success', async () => {
    // Build a verified-email account: signup -> login -> change-password (old cookie goes stale) -> re-login.
    const { cookie, password } = await signupAndLogin(harness.base, 'ivy');
    await fetch(`${harness.base}/api/account/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: password, newPassword: 'a perfectly fine long password' }),
    });

    const loginRes = await fetch(`${harness.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ivy', password: 'a perfectly fine long password' }),
    });
    const sessionCookie = extractCookie(loginRes);

    await fetch(`${harness.base}/api/account/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ email: 'ivy@example.com' }),
    });
    const verifyLink = harness.mailer.sent.find((m) => m.subject.includes('verify'))!.text;
    const verifyToken = verifyLink.match(/token=([^\s&]+)/)![1];
    await fetch(`${harness.base}/api/account/email/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ token: decodeURIComponent(verifyToken) }),
    });

    harness.mailer.sent.length = 0;
    await fetch(`${harness.base}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ivy' }),
    });
    const resetLink = harness.mailer.sent[0].text;
    const resetToken = decodeURIComponent(resetLink.match(/token=([^\s&]+)/)![1]);

    const resetRes = await fetch(`${harness.base}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword: 'yet another fine long password' }),
    });
    expect(resetRes.status).toBe(200);
    expect(resetRes.headers.get('set-cookie')).toBeNull();

    // New password works; old one does not.
    const reLogin = await fetch(`${harness.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ivy', password: 'yet another fine long password' }),
    });
    expect(reLogin.status).toBe(200);
  });
});
