// Creates the durable throwaway test account on the LOCAL dev auth hub and records its credentials in a git-ignored file beside
// the plan. Prints no secret. Local docker stack only (the host must be auth.shatteredarchive.dev on this machine).
// Run with NODE_USE_SYSTEM_CA=1 node make-test-account.mjs <out.json>: the dev stack uses a local mkcert certificate that the
// Windows store trusts and Node does not by default. TLS verification stays on.
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = 'https://auth.shatteredarchive.dev';
const OUT = process.argv[2];
const USERNAME = 'copilot-test';

const questions = JSON.parse(fs.readFileSync('C:/Projects/ShatteredArchive/apps/auth-server/data/dsl-questions.json', 'utf8'));
const list = Array.isArray(questions) ? questions : questions.questions;
const answerFor = new Map(list.map((q) => [q.id ?? q.questionId, q.acceptedAnswers?.[0]]));

async function call(path, init = {}, cookie) {
  const res = await fetch(BASE + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 100) }; }
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') };
}

if (fs.existsSync(OUT)) {
  console.log('credentials file already exists; not creating another account');
  process.exit(0);
}

const challenge = await call('/api/auth/challenge');
const answers = Object.fromEntries(challenge.body.prompts.map((p) => [p.questionId, answerFor.get(p.questionId)]));
if (Object.values(answers).some((a) => !a)) throw new Error('no accepted answer known for a question');

const signup = await call('/api/auth/signup', { method: 'POST', body: JSON.stringify({ username: USERNAME, challengeId: challenge.body.challengeId, answers }) });
console.log('signup status', signup.status, signup.status === 201 ? '' : JSON.stringify(signup.body).slice(0, 120));
if (signup.status !== 201) process.exit(1);

const oneTime = signup.body.password;
const login = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: USERNAME, password: oneTime }) });
console.log('login status', login.status);
const cookie = (login.setCookie ?? '').split(';')[0];
const durable = crypto.randomBytes(18).toString('base64url') + 'aZ9!'; // 12+ characters
const change = await call('/api/account/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: oneTime, newPassword: durable }) }, cookie);
console.log('change-password status', change.status);
if (change.status !== 200) process.exit(1);
const again = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: USERNAME, password: durable }) });
console.log('login with the durable password', again.status);
const me = await call('/api/auth/me', {}, (again.setCookie ?? '').split(';')[0]);

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      purpose: 'Throwaway account on the LOCAL docker dev stack, used by Copilot UI tests against simulacrum only. Never use on a real host.',
      authHub: BASE,
      username: USERNAME,
      password: durable,
      accountId: me.body.id,
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log('account id recorded:', Boolean(me.body.id));
