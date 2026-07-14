import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { registerRoutes } from './app.js';
import { getMudBuilderConfig } from './config.js';

function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

describe('mud-builder-server app', () => {
  it('serves /health', async () => {
    const app = express();
    registerRoutes(app, getMudBuilderConfig({}));
    const { server, base } = await listen(app);
    try {
      const res = await fetch(`${base}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; uptimeSeconds: number };
      expect(body.status).toBe('ok');
      expect(body.uptimeSeconds).toBeGreaterThan(0);
    } finally {
      await close(server);
    }
  });

  it('reports gated-off writes by default via /api/capabilities', async () => {
    const app = express();
    registerRoutes(app, getMudBuilderConfig({}));
    const { server, base } = await listen(app);
    try {
      const res = await fetch(`${base}/api/capabilities`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { writeEnabled: boolean; mercAreaPath: string };
      expect(body.writeEnabled).toBe(false);
      expect(body.mercAreaPath.replace(/\\/g, '/')).toContain('merc-mud/2.4/area');
    } finally {
      await close(server);
    }
  });
});

describe('config', () => {
  it('defaults to merc-mud with writes disabled', () => {
    const cfg = getMudBuilderConfig({});
    expect(cfg.writeEnabled).toBe(false);
    expect(cfg.mercMudPath).toBe('C:/Projects/merc-mud');
    expect(cfg.areaPath.replace(/\\/g, '/')).toContain('merc-mud/2.4/area');
  });

  it('honors env overrides and only the literal "true" enables writes', () => {
    expect(getMudBuilderConfig({ MUD_WRITE_ENABLED: 'true' }).writeEnabled).toBe(true);
    expect(getMudBuilderConfig({ MUD_WRITE_ENABLED: 'TRUE' }).writeEnabled).toBe(false);
    expect(getMudBuilderConfig({ MUD_WRITE_ENABLED: '1' }).writeEnabled).toBe(false);
    const cfg = getMudBuilderConfig({ MERC_MUD_PATH: '/srv/mud', MERC_AREA_DIR: 'area' });
    expect(cfg.areaPath.replace(/\\/g, '/')).toContain('/srv/mud/area');
  });
});
