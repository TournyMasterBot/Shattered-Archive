import express, { type Application } from 'express';

import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';
import { safe } from './safe.js';
import { sessionGuard, mustChangePasswordGuard, sessionCookieHeader, type SessionContext } from './session-guard.js';
import { requireString, requireNewPassword } from './validation.js';

const EMAIL_MAX_LENGTH = 254; // RFC 5321 forward-path limit

/**
 * Index scanning, deliberately NOT a regex. The obvious pattern for this
 * (/^[^\s@]+@[^\s@]+\.[^\s@]+$/) backtracks QUADRATICALLY on a failing input:
 * the literal `\.` is also matched by `[^\s@]`, so the engine has to retry every
 * dot position as the split point before it can give up. Against this route's
 * 32kb JSON cap that is a meaningful amount of CPU burned per request. Scanning
 * by index has no such failure mode — it is linear on every input.
 *
 * Same shape rules as the pattern it replaces (exactly one `@`, a non-empty local
 * part, a dot inside the domain that is neither leading nor trailing, no
 * whitespace), plus a length ceiling. Still deliberately a SHAPE check and not
 * RFC 5322 validation — the only real proof an address works is the verification
 * mail sent to it immediately below.
 */
function looksLikeEmail(value: string): boolean {
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  if (dot < 1 || dot === domain.length - 1) return false;
  return !/\s/.test(value);
}

/**
 * AI-ANNOTATION
 * @ai-summary Session-guarded account actions, blocked while
 *   mustChangePassword is set except change-password itself (see
 *   session-guard.ts's allowlist). change-password AND rotate-master both
 *   mint a FRESH session at the new epoch before responding — the Constraints
 *   corollary: bumping epoch invalidates the caller's OWN current session
 *   too, so skipping this would log the user out right after an action that
 *   was supposed to keep them in.
 * @ai-public registerAccountRoutes
 * @ai-notes /api/account/email/verify is NOT explicitly named in the plan's
 *   step 7 route list, but account-store.verifyEmail(accountId, token) has
 *   no other caller — added here as the obvious missing consumer, mirroring
 *   how reset-password consumes requestPasswordReset's token.
 */
export function registerAccountRoutes(app: Application, deps: AuthServerDeps): void {
  app.use('/api/account', express.json({ limit: '32kb' }));
  app.use('/api/account', sessionGuard(deps.accountStore, deps.keyStore), mustChangePasswordGuard(deps.accountStore));

  app.post(
    '/api/account/change-password',
    safe(async (req, res) => {
      const session = res.locals.session as SessionContext;
      const currentPassword = requireString(req.body, 'currentPassword');
      const newPassword = requireNewPassword(req.body);

      const ok = await deps.accountStore.verifyPasswordFor(session.accountId, currentPassword);
      if (!ok) throw new AuthError('current password is incorrect', 401);

      await deps.accountStore.changePassword(session.accountId, newPassword);
      const account = deps.accountStore.require(session.accountId);
      const freshSession = deps.keyStore.mintSession(account.id, account.epoch);
      res.setHeader('Set-Cookie', sessionCookieHeader(freshSession.token));
      res.json({ message: 'Password changed. Every previously issued API key and session is now invalid.' });
    }),
  );

  app.post(
    '/api/account/email',
    safe(async (req, res) => {
      const session = res.locals.session as SessionContext;
      const email = requireString(req.body, 'email');
      if (!looksLikeEmail(email)) throw new AuthError('email does not look valid', 400);

      const { token } = deps.accountStore.requestEmail(session.accountId, email);
      const link = `${deps.publicOrigin}/verify-email?token=${encodeURIComponent(token)}`;
      await deps.mailer.sendMail({
        to: email,
        subject: 'Shattered Archive — verify your email',
        text: `Verify this address: ${link}`,
      });
      res.json({ message: 'Verification email sent.' });
    }),
  );

  app.post(
    '/api/account/email/verify',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      const token = requireString(req.body, 'token');
      deps.accountStore.verifyEmail(session.accountId, token);
      res.json({ message: 'Email verified.' });
    }),
  );

  app.post(
    '/api/account/rotate-master',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      const epoch = deps.accountStore.rotateEpoch(session.accountId);
      const freshSession = deps.keyStore.mintSession(session.accountId, epoch);
      res.setHeader('Set-Cookie', sessionCookieHeader(freshSession.token));
      res.json({ message: 'Master rotated. Every previously issued API key and session is now invalid.', epoch });
    }),
  );
}
