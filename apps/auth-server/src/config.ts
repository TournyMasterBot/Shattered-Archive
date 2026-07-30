import path from 'path';

/** Runtime configuration for the auth service. */
export interface AuthServerConfig {
  port: number;
  dataDir: string;
  /** LOCAL DEV / test only — 64 hex chars. See DATA_ENCRYPTION_KEY_FILE for the deploy path. */
  dataEncryptionKey?: string;
  /** Deploy path to a mounted key file (self-generated on first boot if absent). */
  dataEncryptionKeyFile?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  publicOrigin: string;
  /**
   * The concrete origin → audience mapping: which services a device enrolled from a given
   * browser origin may later mint access tokens for.
   *
   * This exists because the audience must NOT be the caller's choice. A device asks for a
   * token by naming a `service`, and without this map any enrolled browser could name any
   * service — so an XSS on one app could mint a token for a different, more privileged one.
   * nginx already owns the origin → upstream routing, so this mirrors that same routing table
   * and is the authoritative answer to "what is this origin allowed to talk to".
   *
   * Kept as ONE variable rather than a separate origins allowlist because
   * `deviceAllowedOrigins` is derived from these keys: an origin that may enroll therefore
   * always has a defined audience set, and the two cannot drift apart.
   */
  deviceOriginServices: Map<string, string[]>;
  /**
   * Origins allowed to call the device-credential endpoints WITH credentials — DERIVED from
   * `deviceOriginServices`, never configured separately.
   *
   * Needed because IndexedDB is origin-scoped: a device key enrolled on auth.* is invisible
   * to build.*, so every client origin has to enroll its own key, which makes enrollment a
   * cross-origin credentialed call. It works without loosening the cookie because the hub
   * subdomains are same-SITE (one registrable domain), so the SameSite=Lax session cookie is
   * still sent — but CORS must explicitly permit each origin.
   *
   * An exact-match allowlist, never a wildcard: `Access-Control-Allow-Origin: *` is invalid
   * with credentials, and reflecting an arbitrary Origin would let any site drive an
   * authenticated enrollment.
   *
   * NOTE this only covers SAME-SITE clients. A .com origin authenticating against .dev is
   * cross-SITE, so the SameSite=Lax session cookie is not sent at all and cookie-based
   * enrollment cannot work there — such an app needs the SSO code flow instead. CORS is not
   * the limiting factor; the cookie is.
   */
  deviceAllowedOrigins: string[];
  /**
   * Services for which a device may only mint tokens if the account ALSO holds an active,
   * unexpired API key for that service.
   *
   * The API key stops being something a user pastes into the app and becomes the ENTITLEMENT
   * record: provisioned and revoked in auth-client's existing API-keys UI, while the device
   * key is the credential that actually authenticates. Revoking the key therefore withdraws
   * that service from every one of the account's devices at once.
   *
   * Opt-in per service, and empty by default, because the right answer differs by service: a
   * game anyone may play (kingdom-tactics-server) must stay open to any signed-in account,
   * whereas a privileged authoring tool (mud-builder-server) should require an explicit grant.
   */
  deviceGrantRequiredServices: string[];
  /**
   * Non-fatal DEVICE_ORIGIN_SERVICES parse problems, logged once at startup.
   *
   * Deliberately not a boot failure: a typo in this optional feature's config must not take
   * down login for everyone. Skipping a malformed entry fails CLOSED (that origin simply
   * cannot enroll), so the safe outcome is automatic and the warning explains why.
   */
  deviceConfigWarnings: string[];
}

export function getAuthServerConfig(env: NodeJS.ProcessEnv = process.env): AuthServerConfig {
  const port = Number(env.PORT ?? '62000');
  const { map: deviceOriginServices, warnings } = parseOriginServices(env.DEVICE_ORIGIN_SERVICES);
  return {
    port,
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    dataEncryptionKey: env.DATA_ENCRYPTION_KEY || undefined,
    dataEncryptionKeyFile: env.DATA_ENCRYPTION_KEY_FILE || undefined,
    smtpHost: env.SMTP_HOST || undefined,
    smtpPort: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
    smtpUser: env.SMTP_USER || undefined,
    smtpPass: env.SMTP_PASS || undefined,
    publicOrigin: env.PUBLIC_ORIGIN ?? 'http://localhost:62080',
    deviceOriginServices,
    // Derived, never configured separately — see the interface comment.
    deviceAllowedOrigins: [...deviceOriginServices.keys()],
    deviceGrantRequiredServices: parseList(env.DEVICE_GRANT_REQUIRED_SERVICES),
    deviceConfigWarnings: warnings,
  };
}

/** Comma-separated list, trimmed and de-blanked. */
function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/**
 * Parses `origin=service|service,origin=service` — the mirror of nginx's origin → upstream
 * routing table.
 *
 * Trailing slashes are trimmed from the origin because a browser's `Origin` header never
 * carries one, so a configured "https://x/" would otherwise never match anything. Malformed
 * entries are collected as warnings rather than thrown: see `deviceConfigWarnings`.
 */
export function parseOriginServices(raw: string | undefined): { map: Map<string, string[]>; warnings: string[] } {
  const map = new Map<string, string[]>();
  const warnings: string[] = [];
  if (!raw) return { map, warnings };

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 1) {
      warnings.push(`DEVICE_ORIGIN_SERVICES entry ${JSON.stringify(trimmed)} is not "origin=service" — ignored`);
      continue;
    }
    const origin = trimmed.slice(0, eq).trim().replace(/\/+$/, '');
    const services = parseList(trimmed.slice(eq + 1).replace(/\|/g, ','));
    if (!origin || services.length === 0) {
      warnings.push(`DEVICE_ORIGIN_SERVICES entry ${JSON.stringify(trimmed)} is missing an origin or a service — ignored`);
      continue;
    }
    // Union rather than overwrite, so the same origin listed twice widens instead of one
    // silently winning — the surprising failure would be a service quietly disappearing.
    const merged = new Set([...(map.get(origin) ?? []), ...services]);
    map.set(origin, [...merged]);
  }
  return { map, warnings };
}
