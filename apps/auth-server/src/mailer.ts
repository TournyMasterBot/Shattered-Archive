import nodemailer from 'nodemailer';

import type { AuthServerConfig } from './config.js';
import { logger } from './logger.js';

export interface Mailer {
  sendMail(args: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}

/**
 * Pluggable transport, recovery-only: used by account.ts's add-email
 * verification link and auth.ts's forgot-password reset link. Default
 * console/log transport when SMTP_HOST is unset — MUST work with zero SMTP
 * config for local dev. Signup no longer sends any email (no address exists
 * yet at that point).
 */
export function createMailer(config: AuthServerConfig): Mailer {
  if (!config.smtpHost) {
    return {
      async sendMail({ to, subject, text }) {
        logger.info(`[mailer] SMTP_HOST not set — printing instead of sending`, { to, subject, text });
      },
    };
  }

  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort ?? 587,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
  });

  let fromHost = 'auth-server.local';
  try {
    fromHost = new URL(config.publicOrigin).hostname;
  } catch {
    // PUBLIC_ORIGIN is expected to be a valid URL; fall back rather than crash the mailer over a from-address cosmetic.
  }

  return {
    async sendMail({ to, subject, text, html }) {
      await transport.sendMail({ from: `auth-server <no-reply@${fromHost}>`, to, subject, text, html });
    },
  };
}
