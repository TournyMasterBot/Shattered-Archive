import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { LogLevel, type ServerHealth } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService, Logger, introspect, matchesAudience, exchangeCode } from '@shatteredarchive/services-server';

import { setupKtWebSocketGateway } from './ws/kt-gateway.js';
import { registerKtApiRoutes } from './http/kt-api-routes.js';
import { registerKtSsoRoutes, type KtSsoRoutesDeps } from './http/kt-sso-routes.js';
import { MatchHistoryStore } from './persistence/match-history-store.js';
import { ArmyLayoutStore } from './persistence/army-layout-store.js';
import { toHistoryEntry } from './persistence/to-history-entry.js';

const SERVICE_NAME = 'kingdom-tactics-server';

/**
 * Shared by the WS resolver and the SSO routes — both need the service's own key.
 * `authServerUrl` is the SERVER-TO-SERVER hub URL (introspect/exchange calls) — local dev and
 * docker both set AUTH_SERVER_URL, but docker overrides it to the internal alias
 * (http://auth-server.shatteredarchive.dev:62000, no TLS), mirroring mud-builder-server's own
 * convention. `publicAuthServerUrl` is what the BROWSER gets redirected to for `/sso/authorize`
 * — falls back to `authServerUrl` when unset (local dev, where both coincide), matching the C#
 * site's AuthorizeBaseUrl/BaseUrl split.
 */
function readServiceCredentials(
  log: Logger,
): { authServerUrl: string; publicAuthServerUrl: string; privateKeyPem: string } | undefined {
  const authServerUrl = process.env.AUTH_SERVER_URL;
  const publicAuthServerUrl = process.env.AUTH_SERVER_PUBLIC_URL ?? authServerUrl;
  const keyPath = process.env.SERVICE_PRIVATE_KEY_PATH;
  if (!authServerUrl || !publicAuthServerUrl || !keyPath) {
    log.warn('[kingdom-tactics-server] AUTH_SERVER_URL/SERVICE_PRIVATE_KEY_PATH not set');
    return undefined;
  }
  try {
    return { authServerUrl, publicAuthServerUrl, privateKeyPem: fs.readFileSync(keyPath, 'utf8') };
  } catch (err) {
    log.warn('[kingdom-tactics-server] could not read SERVICE_PRIVATE_KEY_PATH', { err });
    return undefined;
  }
}

/**
 * Phase F: builds the `join`-frame token resolver, or `undefined` if this service isn't
 * configured for it — in which case every join stays fully anonymous, byte-identical to before
 * this phase. The returned function itself never throws: any introspection failure (network
 * error, invalid/expired token, wrong audience, auth-server unreachable) resolves to
 * `undefined`, degrading to an anonymous join rather than rejecting it.
 */
function buildAccountIdResolver(
  log: Logger,
  credentials: { authServerUrl: string; privateKeyPem: string } | undefined,
): ((token: string) => Promise<string | undefined>) | undefined {
  if (!credentials) {
    log.warn('[kingdom-tactics-server] join tokens will be ignored (anonymous only)');
    return undefined;
  }
  const { authServerUrl, privateKeyPem } = credentials;

  return async (token: string) => {
    try {
      const result = await introspect(authServerUrl, SERVICE_NAME, privateKeyPem, token);
      if (!result.valid) {
        log.info('[kingdom-tactics-server] join token is invalid/unrecognized — treating join as anonymous');
        return undefined;
      }
      if (!matchesAudience(result, SERVICE_NAME)) {
        log.info('[kingdom-tactics-server] join token did not match this service\'s audience — treating join as anonymous', {
          tokenService: result.service,
        });
        return undefined;
      }
      log.info('[kingdom-tactics-server] join token resolved to an accountId', { accountId: result.accountId });
      return result.accountId;
    } catch (err) {
      log.warn('[kingdom-tactics-server] token introspection failed — treating join as anonymous', { err });
      return undefined;
    }
  };
}

const log = new Logger({
  consoleLevel: LogLevel.Debug,
  diskJsonLevel: LogLevel.Debug,
  diskJsonEnabled: true,
  diskJsonPath: process.env.JSON_LOG_FILE_PATH ?? './log/server.log.jsonl',
  level: LogLevel.Debug,
  fileLevel: LogLevel.Debug,
  filePath: process.env.LOG_FILE_PATH ?? './log/server.log',
  maxSize: process.env.LOG_MAX_FILE_SIZE ?? undefined,
  maxFiles: process.env.LOG_MAX_FILES ?? undefined,
  datePartitioned: Boolean(process.env.LOG_DATE_PARTITIONED ?? 'false'),
  diskToggleOnSoh: Boolean(process.env.LOG_RESPECT_SOH ?? 'true'),
  sohToggleEventTypes: [],
});

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(baseEnvFile)) {
  throw new Error(`Fatal exception : Could not find base environment file at ${baseEnvFile}`);
}
dotenv.config({ path: baseEnvFile, override: true });

const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
  log.debug('[kingdom-tactics-server] Loaded environment overrides', { envFile });
} else {
  log.warn('[kingdom-tactics-server] No environment override file found', { envFile });
}

const config = getConfigFromEnv('kingdom-tactics-server');

// Built once, shared by the WS `join`-frame resolver, the /api/kt/* HTTP guard, and the SSO
// login routes below.
const credentials = readServiceCredentials(log);
const resolveAccountId = buildAccountIdResolver(log, credentials);

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR ?? './data');
const matchHistory = new MatchHistoryStore(dataDir);
const armyLayouts = new ArmyLayoutStore(dataDir);

// Must match EXACTLY what was registered via `register-redirect-uri` (Step 1 registered
// http://localhost:51000/api/kt/auth/callback for local dev) — the hub's code store burns the
// code on any mismatch between approve-time and exchange-time redirect URIs.
const ktCallbackUrl = process.env.KT_SERVER_CALLBACK_URL ?? `http://localhost:${config.port}/api/kt/auth/callback`;
const allowedReturnOrigins = (process.env.KT_CLIENT_ALLOWED_RETURN_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const service = createExpressService(config, (app) => {
  app.get('/', (_req, res) => {
    res.json({ message: 'Hello from kingdom-tactics-server' });
  });
  app.get('/health', (_req, res) => {
    const health: ServerHealth = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(health);
  });
  registerKtApiRoutes(app, { matchHistory, armyLayouts, resolveAccountId, linkOutUrl: allowedReturnOrigins[0] });

  // Phase F Step 3: kt-client's login hand-off. Only registered when this service is actually
  // configured for it — an unconfigured install simply doesn't expose these routes (a clear
  // 404 on "log in" beats a confusing half-working flow).
  if (credentials && allowedReturnOrigins.length > 0) {
    const ssoDeps: KtSsoRoutesDeps = {
      publicHubBaseUrl: credentials.publicAuthServerUrl,
      hubBaseUrl: credentials.authServerUrl,
      serviceName: SERVICE_NAME,
      redirectUri: ktCallbackUrl,
      privateKeyPem: credentials.privateKeyPem,
      allowedReturnOrigins,
      exchangeCode,
    };
    registerKtSsoRoutes(app, ssoDeps);
  } else {
    log.warn('[kingdom-tactics-server] kt-sso login routes not registered (missing credentials or KT_CLIENT_ALLOWED_RETURN_ORIGINS)');
  }
});

service
  .start()
  .then((httpServer) => {
    log.info('[kingdom-tactics-server] Listening on port', { port: config.port });
    setupKtWebSocketGateway(httpServer, {
      onError: (err) => log.error('[kingdom-tactics-server] /ws/kt error', { err }),
      resolveAccountId,
      onMatchComplete: (session) => {
        const entry = toHistoryEntry(session);
        if (entry.participants.every((p) => p.accountId === null)) return; // fully anonymous — nothing to record
        matchHistory.record(entry);
        log.info('[kingdom-tactics-server] recorded match history', { matchId: entry.matchId, id: entry.id });
      },
    });
    log.info('[kingdom-tactics-server] WebSocket gateway mounted at /ws/kt');
  })
  .catch((err) => {
    log.error('[kingdom-tactics-server] Failed to start', { err });
    process.exit(1);
  });
