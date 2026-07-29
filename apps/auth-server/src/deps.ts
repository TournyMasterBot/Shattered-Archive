import type { AccountStore } from './account-store.js';
import type { KeyStore } from './key-store.js';
import type { QuestionsStore, ChallengeThrottle } from './questions-store.js';
import type { ServiceKeyStore } from './service-key-store.js';
import type { SsoCodeStore } from './sso-code-store.js';
import type { LoginLockout } from './login-lockout.js';
import type { Mailer } from './mailer.js';
import type { AuditLog } from './audit-log.js';

/** Everything the route layer needs, assembled once in index.ts (or a test's setup) and threaded through registerRoutes. */
export interface AuthServerDeps {
  accountStore: AccountStore;
  keyStore: KeyStore;
  questionsStore: QuestionsStore;
  serviceKeyStore: ServiceKeyStore;
  ssoCodeStore: SsoCodeStore;
  challengeThrottle: ChallengeThrottle;
  loginLockout: LoginLockout;
  mailer: Mailer;
  auditLog: AuditLog;
  publicOrigin: string;
}
