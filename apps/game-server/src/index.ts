// apps/game-server/src/index.ts
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { LogLevel, type ServerHealth } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService, MudClientApp } from '@shatteredarchive/services-server';

import type * as http from 'node:http';
import type * as https from 'node:https';
import { WebSocketServer, WebSocket } from 'ws';
import { Logger } from '@shatteredarchive/services-server';
const log = new Logger({
  level: LogLevel.Debug,
});
/**
 * ---------------------------------------------------------------------------
 * ENV CONFIG
 * ---------------------------------------------------------------------------
 *
 * GAME_PROXY_ALLOW_ALL     = "true" to bypass host allowlist
 * GAME_PROXY_ALLOWLIST     = comma-separated host:port entries, e.g.
 *                             "dsl-mud.org:4000,example.org:5000"
 */

const ALLOW_ALL = process.env.GAME_PROXY_ALLOW_ALL === 'true';
const RAW_ALLOWLIST = process.env.GAME_PROXY_ALLOWLIST ?? 'dsl-mud.org:4000';

type AllowedTarget = { host: string; port: number };

const ALLOWLIST: AllowedTarget[] = RAW_ALLOWLIST.split(',')
  .map((entry) => entry.trim())
  .filter((entry) => !!entry)
  .map((entry) => {
    const [host, portStr] = entry.split(':');
    const port = Number(portStr);
    return { host, port };
  })
  .filter((t) => !!t.host && Number.isFinite(t.port) && t.port > 0 && t.port <= 65535);

function isTargetAllowed(host: string, port: number): boolean {
  if (ALLOW_ALL) return true;
  return ALLOWLIST.some((t) => t.host === host && t.port === port);
}

/**
 * WebSocket message shapes
 */
type ClientConnectMessage = {
  type: 'connect';
  host: string;
  port: number;
};

type ClientDataMessage = {
  type: 'data';
  data: string;
};

type ClientMessage = ClientConnectMessage | ClientDataMessage;

type ServerRawMessage = {
  type: 'raw';
  data: string;
};

type ServerGmcpMessage = {
  type: 'gmcp';
  data: string;
};

type ServerErrorMessage = {
  type: 'error';
  message: string;
};

type ServerCloseMessage = {
  type: 'close';
  reason?: string;
};

type ServerMessage = ServerRawMessage | ServerGmcpMessage | ServerErrorMessage | ServerCloseMessage;

/**
 * ---------------------------------------------------------------------------
 * ENV BOOTSTRAP
 * ---------------------------------------------------------------------------
 */

// 1) Load base .env (required)
const baseEnvFile = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(baseEnvFile)) {
  throw new Error(`Fatal exception : Could not find base environment file at ${baseEnvFile}`);
}
dotenv.config({
  path: baseEnvFile,
  override: true,
});

// 2) Load environment-specific overrides (optional)
const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({
    path: envFile,
    override: true,
  });
  log.debug(`[game-server] Loaded environment overrides`, {
    envFile,
  });
} else {
  log.warn('[game-server] No environment override file found', {
    envFile,
  });
}

const config = getConfigFromEnv('game-server');

/**
 * ---------------------------------------------------------------------------
 * EXPRESS SERVICE
 * ---------------------------------------------------------------------------
 */

const service = createExpressService(config, (app) => {
  app.get('/', (_req, res) => {
    log.debug('Accessed /');
    res.json({ message: 'Hello from game-server' });
  });

  app.get('/health', (_req, res) => {
    log.debug('Accessed /health');
    const health: ServerHealth = {
      status: 'ok',
      uptimeSeconds: process.uptime(),
    };
    res.json(health);
  });
});

/**
 * ---------------------------------------------------------------------------
 * WEBSOCKET GATEWAY: /ws/game
 * ---------------------------------------------------------------------------
 */

function setupGameWebSocketGateway(server: http.Server | https.Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws/game',
  });

  log.debug('[game-server] WebSocket gateway mounted at /ws/game', {
    allowAll: ALLOW_ALL,
    allowList: ALLOWLIST.map((t) => `${t.host}:${t.port}`).join(', '),
  });

  wss.on('connection', (ws: WebSocket) => {
    log.info('[game-server] /ws/game client connected');

    let mudApp: MudClientApp | null = null;
    let closed = false;

    const sendToClient = (msg: ServerMessage) => {
      if (closed) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    const closeBoth = (reason?: string) => {
      if (closed) return;
      closed = true;

      if (mudApp) {
        try {
          mudApp.MudClient.TelnetClient.Disconnect();
        } catch {
          // ignore
        }
        mudApp = null;
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, reason);
      }
    };

    ws.on('message', async (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString('utf8')) as ClientMessage;
      } catch {
        sendToClient({ type: 'error', message: 'Invalid JSON payload' });
        return;
      }

      // First message must be connect
      if (!mudApp) {
        if (msg.type !== 'connect') {
          sendToClient({ type: 'error', message: 'First message must be type="connect"' });
          return;
        }

        const host = msg.host?.trim();
        const port = Number(msg.port);

        if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) {
          sendToClient({ type: 'error', message: 'Invalid host/port' });
          return;
        }

        if (!isTargetAllowed(host, port)) {
          sendToClient({
            type: 'error',
            message: `Target ${host}:${port} is not on the allowed list`,
          });
          ws.close(1008, 'Forbidden target: Mud has not been approved by application administrator');
          return;
        }
        log.debug('[game-server] Creating MudClientApp', {
          host,
          port,
        });

        mudApp = new MudClientApp({ host, port });

        // Narrow the type locally to include EventEmitter-style .on()
        const telnet = mudApp.MudClient.TelnetClient as typeof mudApp.MudClient.TelnetClient & {
          on(event: 'dataReceived', listener: (text: string) => void): void;
          on(event: 'gmcpReceived', listener: (gmcp: string) => void): void;
          on(event: 'error', listener: (err: Error) => void): void;
          on(event: 'connectionClosed' | 'disconnect', listener: () => void): void;
        };

        // Wire telnet events → client
        telnet.on('dataReceived', (text: string) => {
          log.debug('[game-server] TELNET RAW', {
            text,
          });
          sendToClient({ type: 'raw', data: text });
        });

        telnet.on('gmcpReceived', (gmcp: string) => {
          log.debug('[game-server] TELNET GMCP', {
            gmcp,
          });
          sendToClient({ type: 'gmcp', data: gmcp });
        });

        telnet.on('error', (err: Error) => {
          log.error('[game-server] TELNET ERROR', {
            err,
          });
          sendToClient({ type: 'error', message: `Remote error: ${err.message}` });
          closeBoth('telnet-error');
        });

        telnet.on('connectionClosed', () => {
          log.debug('[game-server] TELNET connection closed');
          sendToClient({ type: 'close', reason: 'remote-closed' });
          closeBoth('remote-closed');
        });

        telnet.on('disconnect', () => {
          log.debug('[game-server] TELNET disconnect emitted');
          sendToClient({ type: 'close', reason: 'remote-disconnect' });
          closeBoth('remote-disconnect');
        });

        try {
          await telnet.Connect();
          log.info('[game-server] Connected to remote MUD', {
            host,
            port,
          });
        } catch (err: any) {
          log.error('[game-server] Failed to connect to remote MUD', {
            err,
          });
          sendToClient({
            type: 'error',
            message: `Failed to connect to remote MUD: ${err?.message ?? 'unknown error'}`,
          });
          closeBoth('connect-failed');
        }

        return;
      }

      // Already have a MudClientApp: treat messages as data to send
      if (msg.type === 'data') {
        const data = msg.data ?? '';
        try {
          mudApp.MudClient.TelnetClient.Send(data);
        } catch (err: any) {
          log.error('[game-server] Failed to send data to remote', {
            err,
          });
          sendToClient({
            type: 'error',
            message: `Failed to send data to remote: ${err?.message ?? 'unknown error'}`,
          });
        }
      }
    });

    ws.on('close', (code: any, reasonBuf: any) => {
      const reason = reasonBuf?.toString() ?? '';
      log.info('[game-server] WS client closed', {
        code,
        reason,
      });
      closeBoth('ws-closed');
    });

    ws.on('error', (err: any) => {
      log.error('[game-server] WS error', {
        err,
      });
      closeBoth('ws-error');
    });
  });
}

/**
 * ---------------------------------------------------------------------------
 * START SERVICE
 * ---------------------------------------------------------------------------
 */

service
  .start()
  .then((httpServer) => {
    log.info('[game-server] Listening on port', {
      port: config.port,
    });
    setupGameWebSocketGateway(httpServer);
  })
  .catch((err) => {
    log.error('[game-server] Failed to start', {
      err,
    });
    process.exit(1);
  });
