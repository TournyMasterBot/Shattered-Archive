import fs from 'fs';
import path from 'path';

import { canonicalizePublicKeyPem } from './crypto-primitives.js';

/**
 * AI-ANNOTATION
 * @ai-summary Parses the declarative service registry (SERVICE_REGISTRY env) and
 *   reads the shared public-key directory that consuming services publish into.
 *   Together these are the DESIRED state the reconciler drives the ServiceKeyStore
 *   towards, replacing the old manual register-service / register-redirect-uri
 *   ceremony. Pure parsing is split from filesystem access so both are unit-testable.
 * @ai-public parseServiceRegistry, collectPublicKeys, readPublicKeyDir
 * @ai-notes Registry parsing is ALL-OR-NOTHING on purpose. Reconciliation is a full
 *   reconcile (it prunes), so acting on a partially-understood config could revoke
 *   live credentials — any parse problem therefore skips the entire pass rather than
 *   proceeding with whatever happened to parse.
 */

/** One service's desired configuration, as declared in SERVICE_REGISTRY. */
export interface DeclaredService {
  serviceName: string;
  /** Exact-match SSO redirect URIs. Order is irrelevant; duplicates are collapsed. */
  redirectUris: string[];
}

export type ServiceRegistryParse =
  | { ok: true; services: DeclaredService[]; empty: boolean }
  | { ok: false; error: string };

/**
 * SERVICE_REGISTRY is JSON, shaped:
 *
 *   { "shattered-web": { "redirectUris": ["https://site/user/sso/callback", ...] } }
 *
 * JSON rather than this repo's usual comma/pipe env convention (DEVICE_ORIGIN_SERVICES)
 * because the value is genuinely nested — a service owns a LIST of URIs — and encoding
 * that positionally is where such formats stop being readable.
 *
 * Absent or `{}` yields `empty: true`, which the reconciler treats as "do nothing".
 * That is deliberate: with pruning enabled, an unset variable is overwhelmingly more
 * likely to be a broken deploy than an instruction to deregister every service.
 */
export function parseServiceRegistry(raw: string | undefined): ServiceRegistryParse {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, services: [], empty: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: `SERVICE_REGISTRY is not valid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'SERVICE_REGISTRY must be a JSON object keyed by service name' };
  }

  const services: DeclaredService[] = [];
  for (const [serviceName, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!serviceName.trim()) {
      return { ok: false, error: 'SERVICE_REGISTRY contains an empty service name' };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, error: `SERVICE_REGISTRY entry ${JSON.stringify(serviceName)} must be an object` };
    }
    const rawUris = (value as Record<string, unknown>).redirectUris;
    if (rawUris !== undefined && !Array.isArray(rawUris)) {
      return { ok: false, error: `SERVICE_REGISTRY entry ${JSON.stringify(serviceName)}: redirectUris must be an array` };
    }
    const redirectUris: string[] = [];
    for (const uri of (rawUris ?? []) as unknown[]) {
      if (typeof uri !== 'string' || !uri.trim()) {
        return { ok: false, error: `SERVICE_REGISTRY entry ${JSON.stringify(serviceName)}: redirectUris must be non-empty strings` };
      }
      // Validated here as well as in the store so a bad value is a config error at
      // boot rather than a surprise mid-reconcile.
      let url: URL;
      try {
        url = new URL(uri);
      } catch {
        return { ok: false, error: `SERVICE_REGISTRY entry ${JSON.stringify(serviceName)}: ${JSON.stringify(uri)} is not an absolute URL` };
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, error: `SERVICE_REGISTRY entry ${JSON.stringify(serviceName)}: ${JSON.stringify(uri)} must be http(s)` };
      }
      if (url.hash) {
        return { ok: false, error: `SERVICE_REGISTRY entry ${JSON.stringify(serviceName)}: ${JSON.stringify(uri)} must not carry a fragment` };
      }
      if (!redirectUris.includes(uri)) redirectUris.push(uri);
    }
    services.push({ serviceName, redirectUris });
  }

  return { ok: true, services, empty: services.length === 0 };
}

export interface PublicKeyFile {
  fileName: string;
  content: string;
}

export interface CollectedPublicKeys {
  /** service name -> canonical SPKI PEMs. */
  byService: Map<string, string[]>;
  warnings: string[];
}

/**
 * Maps `<service>.pub` files to services, canonicalising and validating each key.
 *
 * `<service>@<label>.pub` maps to the same service, which is what makes a rotation
 * window expressible as data: publish `shattered-web@2026-08.pub` alongside the old
 * file and BOTH keys are live until the old file is removed. That mirrors the store,
 * which already expects multiple non-revoked keys per service mid-rotation.
 *
 * A file that is not a usable Ed25519 public key is warned about and skipped rather
 * than aborting: these files are written by another container, so a read that lands
 * mid-write must degrade to "not yet", not to a failed boot.
 */
export function collectPublicKeys(files: PublicKeyFile[]): CollectedPublicKeys {
  const byService = new Map<string, string[]>();
  const warnings: string[] = [];

  for (const file of files) {
    if (!file.fileName.endsWith('.pub')) continue;
    const stem = file.fileName.slice(0, -'.pub'.length);
    const serviceName = (stem.split('@')[0] ?? '').trim();
    if (!serviceName) {
      warnings.push(`public-key file ${JSON.stringify(file.fileName)} has no service name — skipped`);
      continue;
    }
    const canonical = canonicalizePublicKeyPem(file.content);
    if (!canonical) {
      warnings.push(`public-key file ${JSON.stringify(file.fileName)} is not a usable Ed25519 public key — skipped`);
      continue;
    }
    const list = byService.get(serviceName) ?? [];
    if (!list.includes(canonical)) list.push(canonical);
    byService.set(serviceName, list);
  }

  return { byService, warnings };
}

/** Thin filesystem wrapper over collectPublicKeys. A missing directory is not an error — nothing has published yet. */
export function readPublicKeyDir(dir: string): CollectedPublicKeys {
  if (!dir || !fs.existsSync(dir)) return { byService: new Map(), warnings: [] };

  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return { byService: new Map(), warnings: [`cannot read public-key directory ${JSON.stringify(dir)}: ${(e as Error).message}`] };
  }

  const files: PublicKeyFile[] = [];
  const warnings: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.pub')) continue;
    try {
      files.push({ fileName: name, content: fs.readFileSync(path.join(dir, name), 'utf8') });
    } catch (e) {
      warnings.push(`cannot read ${JSON.stringify(name)}: ${(e as Error).message}`);
    }
  }

  const collected = collectPublicKeys(files);
  return { byService: collected.byService, warnings: [...warnings, ...collected.warnings] };
}
