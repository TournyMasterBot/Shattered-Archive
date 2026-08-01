import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';

import { registerRoutes } from '../app.js';
import { AccountStore } from '../account-store.js';
import { KeyStore } from '../key-store.js';
import { DeviceStore } from '../device-store.js';
import { DeviceNonceStore } from '../device-nonce-store.js';
import { QuestionsStore, ChallengeThrottle } from '../questions-store.js';
import { ServiceKeyStore } from '../service-key-store.js';
import { SsoCodeStore } from '../sso-code-store.js';
import { AuditLog } from '../audit-log.js';
import { LoginLockout } from '../login-lockout.js';
import { RateLimiter } from '../rate-limit.js';
import type { Mailer } from '../mailer.js';
import type { AuthServerDeps } from '../deps.js';

/** Not itself a *.test.ts — shared scaffolding for the route-level test suites. */

export interface TestMailer extends Mailer {
  sent: { to: string; subject: string; text: string }[];
}

function makeTestMailer(): TestMailer {
  const sent: TestMailer['sent'] = [];
  return {
    sent,
    async sendMail(args) {
      sent.push(args);
    },
  };
}

export interface TestHarness {
  server: Server;
  base: string;
  dir: string;
  deps: AuthServerDeps;
  mailer: TestMailer;
  close: () => Promise<void>;
}

const POOL_ANSWERS: Record<string, string> = { q1: 'A1', q2: 'A2', q3: 'A3' };

/** Module-level so `deviceAllowedOrigins` can be derived from its keys, as config.ts does. */
const DEVICE_ORIGIN_SERVICES = new Map<string, string[]>([
  ['http://localhost:60080', ['mud-builder-server']],
  ['http://localhost:50080', ['kingdom-tactics-server']],
]);

export function startTestApp(): Promise<TestHarness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-server-route-test-'));
  const key = crypto.randomBytes(32);
  const mailer = makeTestMailer();
  const deps: AuthServerDeps = {
    accountStore: new AccountStore(dir, key),
    keyStore: new KeyStore(dir, key),
    deviceStore: new DeviceStore(dir, key),
    deviceNonceStore: new DeviceNonceStore(),
    questionsStore: new QuestionsStore(dir),
    serviceKeyStore: new ServiceKeyStore(dir, key),
    ssoCodeStore: new SsoCodeStore(),
    challengeThrottle: new ChallengeThrottle(1000, 1), // effectively unthrottled for tests
    loginLockout: new LoginLockout(1000, 1, 1), // effectively unthrottled for tests
    mailer,
    auditLog: new AuditLog(dir),
    publicOrigin: 'http://localhost:62080',
    // DERIVED from the map below, exactly as config.ts does it — so the harness cannot drift
    // into allowing an origin that has no audience (a state production cannot reach).
    deviceAllowedOrigins: [...DEVICE_ORIGIN_SERVICES.keys()],
    // Two origins mapped to DIFFERENT services, so the audience binding is exercised by the
    // shared harness rather than only by a bespoke setup: a device enrolled from the builder
    // origin must be refused a kingdom-tactics token.
    deviceOriginServices: DEVICE_ORIGIN_SERVICES,
    deviceGrantRequiredServices: [],
    // Effectively unthrottled for tests — the limiter has its own dedicated suite, and a
    // shared limit here would make unrelated route tests fail as a suite grew.
    deviceRateLimiter: {
      perIp: new RateLimiter({ ratePerMinute: 600_000, burst: 100_000 }),
      perDevice: new RateLimiter({ ratePerMinute: 600_000, burst: 100_000 }),
    },
    // Effectively unthrottled for the same reason as the device limiters above.
    serviceRateLimiter: {
      perIp: new RateLimiter({ ratePerMinute: 600_000, burst: 100_000 }),
      perService: new RateLimiter({ ratePerMinute: 600_000, burst: 100_000 }),
    },
  };

  fs.writeFileSync(
    path.join(dir, 'dsl-questions.json'),
    JSON.stringify({
      questions: [
        { id: 'q1', prompt: 'Q1?', acceptedAnswers: [POOL_ANSWERS.q1] },
        { id: 'q2', prompt: 'Q2?', acceptedAnswers: [POOL_ANSWERS.q2] },
        { id: 'q3', prompt: 'Q3?', acceptedAnswers: [POOL_ANSWERS.q3] },
      ],
    }),
  );

  const app = express();
  registerRoutes(app, deps);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve({
        server,
        base,
        dir,
        deps,
        mailer,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => {
              fs.rmSync(dir, { recursive: true, force: true });
              res();
            });
          }),
      });
    });
  });
}

/** Runs the full challenge->signup flow over real HTTP and returns the created account's username/password. */
export async function signupViaHttp(base: string, username: string): Promise<{ username: string; password: string }> {
  const challengeRes = await fetch(`${base}/api/auth/challenge`);
  const challenge = (await challengeRes.json()) as { challengeId: string; prompts: { questionId: string }[] };
  const answers: Record<string, string> = {};
  for (const p of challenge.prompts) answers[p.questionId] = POOL_ANSWERS[p.questionId];

  const signupRes = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, challengeId: challenge.challengeId, answers }),
  });
  const body = (await signupRes.json()) as { username: string; password: string; error?: string };
  if (!signupRes.ok) throw new Error(`signup failed: ${body.error}`);
  return { username: body.username, password: body.password };
}

/** Extracts the sa_session cookie (name=value only) from a fetch Response's Set-Cookie header. */
export function extractCookie(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  const match = raw.match(/sa_session=([^;]+)/);
  return match ? `sa_session=${match[1]}` : '';
}

/** signup -> login, returns a ready-to-use session Cookie header plus the one-time password used. */
export async function signupAndLogin(base: string, username: string): Promise<{ cookie: string; password: string }> {
  const { password } = await signupViaHttp(base, username);
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return { cookie: extractCookie(loginRes), password };
}

/** signup -> login -> change-password, returns a session cookie for an account with mustChangePassword already cleared. */
export async function fullyOnboardedSession(base: string, username: string, newPassword = 'a perfectly fine long password'): Promise<string> {
  const { cookie, password } = await signupAndLogin(base, username);
  const changeRes = await fetch(`${base}/api/account/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ currentPassword: password, newPassword }),
  });
  return extractCookie(changeRes);
}
