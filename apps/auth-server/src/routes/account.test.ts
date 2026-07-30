import { startTestApp, signupAndLogin, fullyOnboardedSession, extractCookie, type TestHarness } from './test-helpers.js';

describe('account routes', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('every /api/account route except change-password is blocked while mustChangePassword is set', async () => {
    const { cookie } = await signupAndLogin(harness.base, 'alice');

    const rotate = await fetch(`${harness.base}/api/account/rotate-master`, { method: 'POST', headers: { Cookie: cookie } });
    expect(rotate.status).toBe(403);
    const rotateBody = (await rotate.json()) as { code: string };
    expect(rotateBody.code).toBe('MUST_CHANGE_PASSWORD');

    const email = await fetch(`${harness.base}/api/account/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'alice@example.com' }),
    });
    expect(email.status).toBe(403);
  });

  it('change-password rejects a wrong currentPassword', async () => {
    const { cookie } = await signupAndLogin(harness.base, 'bob');
    const res = await fetch(`${harness.base}/api/account/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'a perfectly fine long password' }),
    });
    expect(res.status).toBe(401);
  });

  it('change-password rejects a newPassword shorter than the minimum length', async () => {
    const { cookie, password } = await signupAndLogin(harness.base, 'carol');
    const res = await fetch(`${harness.base}/api/account/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: password, newPassword: 'short' }),
    });
    expect(res.status).toBe(400);
  });

  it('change-password invalidates the OLD session/keys and mints a FRESH one at the new epoch', async () => {
    const { cookie, password } = await signupAndLogin(harness.base, 'dave');

    const changeRes = await fetch(`${harness.base}/api/account/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: password, newPassword: 'a perfectly fine long password' }),
    });
    expect(changeRes.status).toBe(200);
    const freshCookie = extractCookie(changeRes);
    expect(freshCookie).not.toBe('');
    expect(freshCookie).not.toBe(cookie);

    // OLD cookie is now dead.
    const oldMe = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: cookie } });
    expect(oldMe.status).toBe(401);

    // NEW cookie works, and mustChangePassword is cleared.
    const newMe = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: freshCookie } });
    expect(newMe.status).toBe(200);
    expect(((await newMe.json()) as { mustChangePassword: boolean }).mustChangePassword).toBe(false);
  });

  it('rotate-master invalidates the OLD session and mints a FRESH one, without touching the password', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'erin');

    const rotateRes = await fetch(`${harness.base}/api/account/rotate-master`, { method: 'POST', headers: { Cookie: cookie } });
    expect(rotateRes.status).toBe(200);
    const freshCookie = extractCookie(rotateRes);
    expect(freshCookie).not.toBe(cookie);

    const oldMe = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: cookie } });
    expect(oldMe.status).toBe(401);
    const newMe = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: freshCookie } });
    expect(newMe.status).toBe(200);
  });

  it('email verify requires a correct token', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'frank');
    await fetch(`${harness.base}/api/account/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'frank@example.com' }),
    });
    const res = await fetch(`${harness.base}/api/account/email/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ token: 'not-the-real-token' }),
    });
    expect(res.status).toBe(400);

    const me = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: cookie } });
    expect(((await me.json()) as { emailVerified: boolean }).emailVerified).toBe(false);
  });

  it('email rejects an obviously invalid address', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'gail');
    const res = await fetch(`${harness.base}/api/account/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
  });

  /**
   * The shape check is index-scanned rather than regex-matched, because the obvious
   * pattern backtracks quadratically on failing input (see looksLikeEmail). These pin
   * the rules that rewrite has to keep: one '@', a dot inside the domain that is
   * neither leading nor trailing, no whitespace, and a length ceiling. The long case
   * is the one that used to burn CPU proportional to the square of its length.
   */
  it.each([
    ['two @ signs', 'a@b@example.com', 'bad1'],
    ['no local part', '@example.com', 'bad2'],
    ['no dot in the domain', 'alice@example', 'bad3'],
    ['domain ends in a dot', 'alice@example.', 'bad4'],
    ['domain starts with a dot', 'alice@.com', 'bad5'],
    ['internal whitespace', 'ali ce@example.com', 'bad6'],
    ['over the 254 char ceiling', `${'a'.repeat(250)}@example.com`, 'bad7'],
    ['the quadratic-backtracking shape', `x@${'a.'.repeat(2000)}@`, 'bad8'],
  ])('email rejects %s', async (_label, address, username) => {
    const cookie = await fullyOnboardedSession(harness.base, username);
    const res = await fetch(`${harness.base}/api/account/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: address }),
    });
    expect(res.status).toBe(400);
  });

  it('email still accepts ordinary addresses, including subdomains and plus tags', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'hank');
    for (const address of ['alice@example.com', 'a.b+tag@mail.corp.example.co.uk', "o'brien@example.org"]) {
      const res = await fetch(`${harness.base}/api/account/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ email: address }),
      });
      expect(res.status).toBe(200);
    }
  });

  it('every /api/account route requires a session at all', async () => {
    const res = await fetch(`${harness.base}/api/account/rotate-master`, { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
