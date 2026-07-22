import type { AccountStore } from './account-store.js';
import type { KeyStore } from './key-store.js';
import type { QuestionsStore, ChallengeThrottle } from './questions-store.js';
import type { ServiceKeyStore } from './service-key-store.js';
import type { Mailer } from './mailer.js';

/** Everything the route layer needs, assembled once in index.ts (or a test's setup) and threaded through registerRoutes. */
export interface AuthServerDeps {
  accountStore: AccountStore;
  keyStore: KeyStore;
  questionsStore: QuestionsStore;
  serviceKeyStore: ServiceKeyStore;
  challengeThrottle: ChallengeThrottle;
  mailer: Mailer;
  publicOrigin: string;
}
