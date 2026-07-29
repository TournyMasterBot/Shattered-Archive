import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { AuthStore } from '../auth-store.js';
import type { MudBuilderConfig } from '../config.js';
import { SnippetStore } from '../snippet-store.js';
import { registerSummaryRoutes } from './summary.js';

type IntrospectConfig = Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath' | 'clientUrl'>;

function makeServiceKeyFile(): string {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-summary-route-svc-key-'));
  const file = path.join(dir, 'shattered-service.key');
  fs.writeFileSync(file, pem, 'utf8');
  return file;
}

function startFakeIntrospect(respond: () => unknown): Promise<{ server: Server; url: string }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/introspect') {
      req.on('data', () => undefined);
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(respond()));
      });
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

function startTestApp(
  dir: string,
  introspectConfig: IntrospectConfig = { authServerUrl: 'http://127.0.0.1:1' },
): Promise<{ server: Server; base: string; store: AuthStore; snippetStore: SnippetStore }> {
  const store = new AuthStore(path.join(dir, 'auth'));
  store.init();
  const snippetStore = new SnippetStore(dir);
  const app = express();
  registerSummaryRoutes(app, store, snippetStore, introspectConfig);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store, snippetStore });
    });
  });
}

function readMasterKey(dir: string): string {
  const raw = fs.readFileSync(path.join(dir, 'auth', 'builder-auth.json'), 'utf8');
  return (JSON.parse(raw) as { masterKey: string }).masterKey;
}

async function startAppAsAccount(
  dir: string,
  accountId: string,
  clientUrl?: string,
): Promise<{ server: Server; base: string; snippetStore: SnippetStore; fakeServer: Server; token: string }> {
  const fake = await startFakeIntrospect(() => ({
    valid: true,
    accountId,
    service: 'mud-builder-server',
    label: 'test key',
    username: 'builder',
    expiresAt: null,
    tokenType: 'api',
  }));
  const { server, base, snippetStore } = await startTestApp(dir, {
    authServerUrl: fake.url,
    servicePrivateKeyPath: makeServiceKeyFile(),
    clientUrl,
  });
  return { server, base, snippetStore, fakeServer: fake.server, token: 'a-centrally-issued-token' };
}

describe('GET /api/user-content/summary (Phase H)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-summary-route-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('401s with no token', async () => {
    const { server, base } = await startTestApp(dir);
    try {
      expect((await fetch(`${base}/api/user-content/summary`)).status).toBe(401);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('403s the master key — no accountId to summarize', async () => {
    const { server, base } = await startTestApp(dir);
    try {
      const master = readMasterKey(dir);
      const res = await fetch(`${base}/api/user-content/summary`, { headers: { authorization: `Bearer ${master}` } });
      expect(res.status).toBe(403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('reports counts by kind, the latest updatedAt, and a null link-out when unconfigured', async () => {
    const { server, base, snippetStore, fakeServer, token } = await startAppAsAccount(dir, 'acct-1');
    try {
      snippetStore.save('acct-1', [
        { id: 's1', kind: 'room', name: 'A', data: {}, createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' },
        { id: 's2', kind: 'room', name: 'B', data: {}, createdAt: '2026-07-02T00:00:00Z', updatedAt: '2026-07-20T00:00:00Z' },
        { id: 's3', kind: 'mob', name: 'C', data: {}, createdAt: '2026-07-03T00:00:00Z', updatedAt: '2026-07-03T00:00:00Z' },
      ]);
      const res = await fetch(`${base}/api/user-content/summary`, { headers: { authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        snippetCount: 3,
        byKind: { room: 2, mob: 1, object: 0, script: 0 },
        updatedAt: '2026-07-20T00:00:00Z',
        linkOutUrl: null,
      });
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fakeServer.close(r));
    }
  });

  it('reports the configured link-out and isolates a second account', async () => {
    const { server, base, snippetStore, fakeServer, token } = await startAppAsAccount(dir, 'acct-1', 'https://mud.example.test');
    try {
      snippetStore.save('acct-2', [{ id: 'other', kind: 'object', name: 'X', data: {}, createdAt: 'x', updatedAt: 'x' }]);
      const res = await fetch(`${base}/api/user-content/summary`, { headers: { authorization: `Bearer ${token}` } });
      const body = await res.json();
      expect(body).toEqual({ snippetCount: 0, byKind: { room: 0, mob: 0, object: 0, script: 0 }, updatedAt: null, linkOutUrl: 'https://mud.example.test' });
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fakeServer.close(r));
    }
  });
});
