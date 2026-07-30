import type { AccountStore } from './account-store.js';
import type { KeyStore } from './key-store.js';
import type { DeviceStore } from './device-store.js';
import type { DeviceNonceStore } from './device-nonce-store.js';
import type { QuestionsStore, ChallengeThrottle } from './questions-store.js';
import type { ServiceKeyStore } from './service-key-store.js';
import type { SsoCodeStore } from './sso-code-store.js';
import type { LoginLockout } from './login-lockout.js';
import type { Mailer } from './mailer.js';
import type { AuditLog } from './audit-log.js';
import type { RateLimiter } from './rate-limit.js';

/** Everything the route layer needs, assembled once in index.ts (or a test's setup) and threaded through registerRoutes. */
export interface AuthServerDeps {
  accountStore: AccountStore;
  keyStore: KeyStore;
  deviceStore: DeviceStore;
  deviceNonceStore: DeviceNonceStore;
  questionsStore: QuestionsStore;
  serviceKeyStore: ServiceKeyStore;
  ssoCodeStore: SsoCodeStore;
  challengeThrottle: ChallengeThrottle;
  loginLockout: LoginLockout;
  mailer: Mailer;
  auditLog: AuditLog;
  publicOrigin: string;
  /** Exact-match origins permitted to call /api/device with credentials. See config.ts. */
  deviceAllowedOrigins: string[];
  /**
   * origin → the services a device enrolled from that origin may mint for. The authority on a
   * device's audience; the service named in an assert request is only ever checked AGAINST it.
   */
  deviceOriginServices: Map<string, string[]>;
  /** Services that additionally require an active API-key grant on the account. See config.ts. */
  deviceGrantRequiredServices: string[];
  /** Backs up nginx's device_auth zone; also carries the per-device limit nginx cannot express. */
  deviceRateLimiter: DeviceRateLimiters;
}

/**
 * Two keyings, because they stop different things: per-IP mirrors the edge zone, while
 * per-device bounds a single enrolled key being driven hard from many addresses — which is
 * exactly the shape a stolen-key or botnet attempt takes, and which nginx cannot see.
 */
export interface DeviceRateLimiters {
  perIp: RateLimiter;
  perDevice: RateLimiter;
}
