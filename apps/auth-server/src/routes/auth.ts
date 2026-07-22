import express, { type Application } from 'express';

import type { AccountRecord } from '../account-store.js';
import { generateOneTimePassword } from '../account-store.js';
import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';
import { safe } from './safe.js';
import { sessionGuard, sessionCookieHeader, clearSessionCookieHeader, type SessionContext } from './session-guard.js';
import { requireNewUsername, requireString, requireNewPassword, requireChallengeAnswers } from './validation.js';

/**
 * AI-ANNOTATION
 * @ai-summary Public-ish auth flows: anti-bot challenge, signup (one-time
 *   password shown once), login/logout/me (session cookie), forgot/reset
 *   password (anti-enumeration: forgot-password ALWAYS returns the same
 *   response, reset-password never auto-logs-in).
 * @ai-public registerAuthRoutes
 */

function toPublicSummary(account: AccountRecord) {
  return {
    id: account.id,
    username: account.username,
    mustChangePassword: account.mustChangePassword,
    emailOnFile: Boolean(account.email),
    emailVerified: Boolean(account.emailVerifiedAt),
  };
}

export function registerAuthRoutes(app: Application, deps: AuthServerDeps): void {
  // Scoped to /api/auth: an app-wide parser here would cap EVERY later route's body too early.
  app.use('/api/auth', express.json({ limit: '64kb' }));

  app.get(
    '/api/auth/challenge',
    safe((req, res) => {
      if (!deps.challengeThrottle.allow(req.ip ?? 'unknown')) {
        throw new AuthError('too many challenge requests — try again shortly', 429);
      }
      const { challengeId, prompts } = deps.questionsStore.issueChallenge();
      res.json({ challengeId, prompts });
    }),
  );

  app.post(
    '/api/auth/signup',
    safe(async (req, res) => {
      const username = requireNewUsername(req.body);
      const { challengeId, answers } = requireChallengeAnswers(req.body);

      // Verified FIRST — a failed challenge creates NO account and never says which answer was wrong.
      const challengeOk = deps.questionsStore.verifyChallenge(challengeId, answers);
      if (!challengeOk) {
        throw new AuthError('challenge verification failed', 400);
      }

      const password = generateOneTimePassword();
      const account = await deps.accountStore.createAccount(username, password);
      res.status(201).json({
        username: account.username,
        password,
        note: 'Write this password down now — it is shown only once. You must change it on first login.',
      });
    }),
  );

  app.post(
    '/api/auth/login',
    safe(async (req, res) => {
      const username = requireString(req.body, 'username');
      const password = requireString(req.body, 'password');
      const account = await deps.accountStore.authenticate(username, password);
      if (!account) throw new AuthError('invalid username or password', 401);

      const session = deps.keyStore.mintSession(account.id, account.epoch);
      res.setHeader('Set-Cookie', sessionCookieHeader(session.token));
      res.json(toPublicSummary(account));
    }),
  );

  app.post(
    '/api/auth/logout',
    sessionGuard(deps.accountStore, deps.keyStore),
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      deps.keyStore.revokeById(session.keyId);
      res.setHeader('Set-Cookie', clearSessionCookieHeader());
      res.json({ loggedOut: true });
    }),
  );

  app.get(
    '/api/auth/me',
    sessionGuard(deps.accountStore, deps.keyStore),
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      res.json(toPublicSummary(deps.accountStore.require(session.accountId)));
    }),
  );

  app.post(
    '/api/auth/forgot-password',
    safe(async (req, res) => {
      const username = requireString(req.body, 'username');
      const result = deps.accountStore.requestPasswordReset(username);
      if (result) {
        const link = `${deps.publicOrigin}/reset-password?token=${encodeURIComponent(result.token)}`;
        await deps.mailer.sendMail({
          to: result.email,
          subject: 'Shattered Archive — password reset',
          text: `Reset your password: ${link}\n\nIf you did not request this, ignore this email.`,
        });
      }
      // Identical response whether or not the account/email exists — anti-enumeration (Constraints).
      res.json({ message: 'If that account can receive a reset link, one was sent.' });
    }),
  );

  app.post(
    '/api/auth/reset-password',
    safe(async (req, res) => {
      const token = requireString(req.body, 'token');
      const newPassword = requireNewPassword(req.body, 'newPassword');
      await deps.accountStore.resetPassword(token, newPassword);
      // No auto-login — this caller never had a session to begin with; they log in fresh.
      res.json({ message: 'Password reset. Log in with your new password.' });
    }),
  );
}
