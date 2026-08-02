import { parseServiceRegistry, readPublicKeyDir, type CollectedPublicKeys } from './service-registry.js';
import type { DesiredServiceState, ReconcileAction } from './service-key-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Turns declarative config (SERVICE_REGISTRY) plus the shared public-key
 *   directory into a ServiceKeyStore.reconcile() call, so service registration and SSO
 *   redirect URIs are provisioned automatically at boot instead of by the one-shot
 *   register-service / register-redirect-uri scripts. Idempotent: a converged system
 *   produces zero actions and zero writes.
 * @ai-public reconcileServiceRegistry, type RegistryReconcileResult
 * @ai-notes Three refusals guard the pruning half, and all three exist because a full
 *   reconcile can revoke live credentials: unparseable config skips entirely, empty
 *   config skips entirely, and a declared service with NO published key files leaves
 *   its keys untouched (null, not []) so a slow-booting consumer is never deregistered.
 */

/** Minimal surface needed from ServiceKeyStore — keeps this unit-testable with a fake. */
export interface ReconcilableStore {
  reconcile(desired: DesiredServiceState[]): ReconcileAction[];
}

export interface RegistryReconcileOptions {
  /** Raw SERVICE_REGISTRY value. */
  registryRaw: string | undefined;
  /** Directory consuming services publish `<service>.pub` into. */
  publicKeyDir: string;
  store: ReconcilableStore;
  /** Injectable for tests; defaults to the real filesystem read. */
  readKeys?: (dir: string) => CollectedPublicKeys;
}

export interface RegistryReconcileResult {
  /** False when the pass deliberately did nothing — see skippedReason. */
  ran: boolean;
  skippedReason?: string;
  actions: ReconcileAction[];
  warnings: string[];
}

export function reconcileServiceRegistry(options: RegistryReconcileOptions): RegistryReconcileResult {
  const { registryRaw, publicKeyDir, store, readKeys = readPublicKeyDir } = options;

  const parsed = parseServiceRegistry(registryRaw);
  if (!parsed.ok) {
    // Refusing here rather than reconciling what parsed is the whole point: this pass
    // PRUNES, so acting on a half-understood registry could revoke live credentials.
    return { ran: false, skippedReason: parsed.error, actions: [], warnings: [] };
  }
  if (parsed.empty) {
    return {
      ran: false,
      skippedReason: 'SERVICE_REGISTRY is unset or declares no services — skipping (an unset variable is a broken deploy far more often than an instruction to deregister everything)',
      actions: [],
      warnings: [],
    };
  }

  const { byService, warnings } = readKeys(publicKeyDir);

  const desired: DesiredServiceState[] = parsed.services.map((service) => {
    const published = byService.get(service.serviceName);
    return {
      serviceName: service.serviceName,
      // null (not []) when nothing is published yet — "unknown", so keys are left alone.
      publicKeyPems: published && published.length > 0 ? published : null,
      redirectUris: service.redirectUris,
    };
  });

  const allWarnings = [...warnings];
  for (const service of desired) {
    if (service.publicKeyPems === null) {
      allWarnings.push(
        `service ${JSON.stringify(service.serviceName)} is declared but has published no public key yet — ` +
          `its redirect URIs are reconciled, its keys are left untouched. This is expected while that service is still starting.`,
      );
    }
  }

  const actions = store.reconcile(desired);
  return { ran: true, actions, warnings: allWarnings };
}
