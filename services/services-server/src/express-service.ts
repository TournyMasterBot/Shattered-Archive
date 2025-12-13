// services/services-server/src/expressService.ts
import express, { Application } from 'express';
import * as http from 'node:http';
import * as https from 'node:https';
import * as fs from 'node:fs';

import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';

export interface ExpressServiceConfig {
  /** Logical service name, used for logging */
  name: string;
  /** Port to listen on */
  port: number;
  /** Host / bind address (default: 0.0.0.0) */
  host?: string;

  /** Enable HTTPS / SSL if true */
  enableSsl?: boolean;
  /** Path to SSL key (PEM) */
  sslKeyPath?: string;
  /** Path to SSL cert (PEM) */
  sslCertPath?: string;
  /** Optional CA bundle */
  sslCaPath?: string;

  /** CORS origin policy; default: true */
  corsOrigin?: CorsOptions['origin'];

  /** See Express docs: trust proxies */
  trustProxy?: boolean | number | string;

  /** Enable request logging hook */
  enableRequestLogging?: boolean;
}

export type RouteRegistrar = (app: Application) => void;

export interface IExpressService {
  readonly app: Application;
  start(): Promise<http.Server | https.Server>;
  stop(): Promise<void>;
}

/**
 * Loads a standardized configuration for an Express service from environment
 * variables. Centralized so apps don’t duplicate config logic.
 *
 * Each service sets its name, but env determines:
 *  - PORT                (default 30000)
 *  - SSL_ENABLED         ("true" / "false")
 *  - SSL_KEY_PATH
 *  - SSL_CERT_PATH
 *  - SSL_CA_PATH
 *  - CORS_ORIGIN
 *  - TRUST_PROXY
 *  - REQUEST_LOGGING     ("true" / "false")
 */
export function getConfigFromEnv(serviceName: string): ExpressServiceConfig {
  const port = Number(process.env.PORT);
  const enableSsl = process.env.SSL_ENABLED === 'true';

  return {
    name: serviceName,
    port,
    host: process.env.HOST ?? '0.0.0.0',

    enableSsl,
    sslKeyPath: process.env.SSL_KEY_PATH,
    sslCertPath: process.env.SSL_CERT_PATH,
    sslCaPath: process.env.SSL_CA_PATH,

    corsOrigin: process.env.CORS_ORIGIN ?? true,
    trustProxy:
      process.env.TRUST_PROXY === undefined
        ? undefined
        : process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1',

    enableRequestLogging: process.env.REQUEST_LOGGING === 'true',
  };
}

/**
 * Creates a hardened Express service with OWASP/Troy Hunt best-practice defaults.
 */
export function createExpressService(config: ExpressServiceConfig, registerRoutes: RouteRegistrar): IExpressService {
  const app = express();

  // disable express signature
  app.disable('x-powered-by');

  // HTTP Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS
  app.use(
    cors({
      origin: config.corsOrigin ?? true,
      credentials: true,
    }),
  );

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Trust proxies
  if (config.trustProxy !== undefined) {
    app.set('trust proxy', config.trustProxy);
  }

  // App-specific route registration
  registerRoutes(app);

  // Server lifecycle
  let server: http.Server | https.Server | null = null;

  async function start(): Promise<http.Server | https.Server> {
    if (server) return server;

    const host = config.host ?? '0.0.0.0';

    if (config.enableSsl) {
      const key = fs.readFileSync(config.sslKeyPath!);
      const cert = fs.readFileSync(config.sslCertPath!);
      const ca = config.sslCaPath ? fs.readFileSync(config.sslCaPath) : undefined;

      const options: https.ServerOptions = { key, cert };
      if (ca) options.ca = ca;

      server = https.createServer(options, app);
    } else {
      server = http.createServer(app);
    }

    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(config.port, host, () => {
        server!.off('error', reject);
        resolve();
      });
    });

    return server!;
  }

  async function stop(): Promise<void> {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
  }

  return { app, start, stop };
}
