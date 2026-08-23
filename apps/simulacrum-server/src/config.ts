/**
 * Runtime configuration for simulacrum-server.
 *
 * Two independent listeners share this one config: a small Express surface (`port`) and a
 * plain TCP relay (`relayPort`) that gates every connection with a trusted+ access code
 * before ever dialing merc-mud. See .ai-plans/20260816-0701-simulacrum-mud-wiring.md Step 1.
 */
export interface SimulacrumConfig {
  /** Express surface port (health, SSO, access-code minting, the standalone sign-in page). */
  port: number;
  /** Plain TCP relay port — the actual play connection, gated by an access code. */
  relayPort: number;
  /** merc-mud's host on the `sa-shared` docker network (Step 4's alias, e.g. "simulacrum-engine"). */
  mercMudHost: string;
  /** merc-mud's raw telnet port behind that alias. */
  mercMudPort: number;
  /** How long the relay waits for the access-code line before giving up and closing. */
  accessCodePromptTimeoutMs: number;
  /** How long a minted access code stays valid before it's rejected as expired. */
  accessCodeTtlMs: number;
  /** Where access-codes/<code>.txt files are read and written. */
  accessCodesPath: string;
  /**
   * Where the SHARED roles.json lives — a single-file bind mount onto mud-builder-server's
   * own auth/roles.json (Constraints: shared tier data, nothing else). RoleStore joins this
   * with 'roles.json' itself, so this must be the FILE's parent directory, not the file.
   */
  roleStoreDataPath: string;
  /** Internal docker-network URL for introspect calls (never the browser-facing one below). */
  authServerUrl: string;
  /**
   * BROWSER-facing auth origin — also serves auth-client's SPA at the same origin (confirmed:
   * `auth.shatteredarchive.dev` routes both `/sso/authorize` and `/api/*` on one nginx server
   * block), so this single value doubles as the SSO redirect target and the introspect-check
   * public reference. Absent = the sign-in page cannot link anywhere; treated as a boot warning,
   * not a hard failure, matching mud-builder-server's own optional-public-url precedent.
   */
  authServerPublicUrl?: string;
  /** Path to this service's registered introspect private key (`register-service` output). */
  servicePrivateKeyPath?: string;
  /** This service's OWN public origin — used to build the SSO callback redirect_uri. */
  publicUrl?: string;
  /** Whether the sign-in cookie gets the `Secure` attribute — off only for local HTTP dev. */
  cookieSecure: boolean;
}

export function getSimulacrumConfig(env: NodeJS.ProcessEnv = process.env): SimulacrumConfig {
  return {
    port: Number(env.PORT ?? '65000'),
    relayPort: Number(env.SIMULACRUM_RELAY_PORT ?? '65001'),
    mercMudHost: env.SIMULACRUM_HOST ?? 'simulacrum-engine',
    mercMudPort: Number(env.SIMULACRUM_PORT ?? '4000'),
    accessCodePromptTimeoutMs: Number(env.SIMULACRUM_ACCESS_CODE_TIMEOUT_MS ?? '30000'),
    accessCodeTtlMs: Number(env.SIMULACRUM_ACCESS_CODE_TTL_MS ?? String(5 * 60 * 1000)),
    accessCodesPath: env.SIMULACRUM_ACCESS_CODES_PATH ?? './data/access-codes',
    roleStoreDataPath: env.SIMULACRUM_ROLE_STORE_PATH ?? './data/roles',
    authServerUrl: env.AUTH_SERVER_URL ?? 'http://localhost:62000',
    authServerPublicUrl: env.AUTH_SERVER_PUBLIC_URL?.replace(/\/+$/, '') || undefined,
    servicePrivateKeyPath: env.SERVICE_PRIVATE_KEY_PATH || undefined,
    publicUrl: env.SIMULACRUM_PUBLIC_URL?.replace(/\/+$/, '') || undefined,
    cookieSecure: env.SIMULACRUM_COOKIE_SECURE !== 'false',
  };
}
