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
import { RoleStore } from '../role-store.js';
import { SnippetStore, type Snippet } from '../snippet-store.js';
import { registerSnippetRoutes } from './snippets.js';
import type { ServiceTier } from '@shatteredarchive/services-server';

type IntrospectConfig = Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>;

function makeServiceKeyFile(): string {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-snippets-route-svc-key-'));
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
): Promise<{ server: Server; base: string; store: AuthStore; snippetStore: SnippetStore; roleStore: RoleStore }> {
  const store = new AuthStore(path.join(dir, 'auth'));
  store.init();
  const snippetStore = new SnippetStore(dir);
  const roleStore = new RoleStore(path.join(dir, 'auth'));
  const app = express();
  registerSnippetRoutes(app, store, snippetStore, roleStore, introspectConfig);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store, snippetStore, roleStore });
    });
  });
}

function readMasterKey(dir: string): string {
  const raw = fs.readFileSync(path.join(dir, 'auth', 'builder-auth.json'), 'utf8');
  return (JSON.parse(raw) as { masterKey: string }).masterKey;
}

/** Defaults to `trusted` — the floor every existing snippet test relies on; pass a lower/higher tier explicitly to probe the boundary. */
async function startAppAsAccount(
  dir: string,
  accountId: string,
  tier: ServiceTier | null = 'trusted',
): Promise<{ server: Server; base: string; snippetStore: SnippetStore; roleStore: RoleStore; fakeServer: Server; token: string }> {
  const fake = await startFakeIntrospect(() => ({
    valid: true,
    accountId,
    service: 'mud-builder-server',
    label: 'test key',
    username: 'builder',
    expiresAt: null,
    tokenType: 'api',
  }));
  const { server, base, snippetStore, roleStore } = await startTestApp(dir, {
    authServerUrl: fake.url,
    servicePrivateKeyPath: makeServiceKeyFile(),
  });
  if (tier) roleStore.setTier(accountId, 'builder', tier, 'test-setup');
  return { server, base, snippetStore, roleStore, fakeServer: fake.server, token: 'a-centrally-issued-token' };
}

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'snip1',
    kind: 'room',
    name: 'A cozy room',
    data: { description: 'test' },
    createdAt: '2026-07-28T00:00:00Z',
    updatedAt: '2026-07-28T00:00:00Z',
    ...overrides,
  };
}

describe('snippet routes', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-snippets-route-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('GET /api/snippets', () => {
    it('401s with no token', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        expect((await fetch(`${base}/api/snippets`)).status).toBe(401);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('403s the master key — no accountId to own snippets under', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const master = readMasterKey(dir);
        const res = await fetch(`${base}/api/snippets`, { headers: { Authorization: `Bearer ${master}` } });
        expect(res.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('403s a local API key', async () => {
      const { server, base, store } = await startTestApp(dir);
      try {
        const { token } = store.createKey('operator');
        const res = await fetch(`${base}/api/snippets`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('403s a plain user-tier account (no role-store grant)', async () => {
      const { server, base, fakeServer, token } = await startAppAsAccount(dir, 'acct1', null);
      try {
        const res = await fetch(`${base}/api/snippets`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(403);
        expect(((await res.json()) as { error: string }).error).toMatch(/trusted tier or above/);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('succeeds for an owner-tier account too (trusted is a floor, not an exact match)', async () => {
      const { server, base, fakeServer, token } = await startAppAsAccount(dir, 'acct1', 'owner');
      try {
        const res = await fetch(`${base}/api/snippets`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(200);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('returns an empty list for an account with none yet', async () => {
      const { server, base, fakeServer, token } = await startAppAsAccount(dir, 'acct1');
      try {
        const res = await fetch(`${base}/api/snippets`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ snippets: [] });
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it("returns only the caller's OWN snippets, never another account's", async () => {
      const { server, base, snippetStore, fakeServer, token } = await startAppAsAccount(dir, 'acct1');
      try {
        snippetStore.save('acct1', [makeSnippet({ id: 'mine' })]);
        snippetStore.save('acct2', [makeSnippet({ id: 'theirs' })]);
        const res = await fetch(`${base}/api/snippets`, { headers: { Authorization: `Bearer ${token}` } });
        const body = (await res.json()) as { snippets: Snippet[] };
        expect(body.snippets.map((s) => s.id)).toEqual(['mine']);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });
  });

  describe('PUT /api/snippets', () => {
    it('saves and round-trips a snippet', async () => {
      const { server, base, fakeServer, token } = await startAppAsAccount(dir, 'acct1');
      try {
        const putRes = await fetch(`${base}/api/snippets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ snippets: [makeSnippet()] }),
        });
        expect(putRes.status).toBe(200);

        const getRes = await fetch(`${base}/api/snippets`, { headers: { Authorization: `Bearer ${token}` } });
        const body = (await getRes.json()) as { snippets: Snippet[] };
        expect(body.snippets).toHaveLength(1);
        expect(body.snippets[0].name).toBe('A cozy room');
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('replaces the whole collection (delete-by-omission)', async () => {
      const { server, base, snippetStore, fakeServer, token } = await startAppAsAccount(dir, 'acct1');
      snippetStore.save('acct1', [makeSnippet({ id: 'one' }), makeSnippet({ id: 'two' })]);
      try {
        const res = await fetch(`${base}/api/snippets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ snippets: [makeSnippet({ id: 'one' })] }),
        });
        expect(res.status).toBe(200);
        expect(snippetStore.list('acct1').map((s) => s.id)).toEqual(['one']);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('400s a malformed snippet (missing name)', async () => {
      const { server, base, fakeServer, token } = await startAppAsAccount(dir, 'acct1');
      try {
        const res = await fetch(`${base}/api/snippets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ snippets: [{ id: 'x', kind: 'room', data: {}, createdAt: '', updatedAt: '' }] }),
        });
        expect(res.status).toBe(400);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('403s a plain user-tier account (no role-store grant), writing nothing', async () => {
      const { server, base, snippetStore, fakeServer, token } = await startAppAsAccount(dir, 'acct1', null);
      try {
        const res = await fetch(`${base}/api/snippets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ snippets: [makeSnippet()] }),
        });
        expect(res.status).toBe(403);
        expect(((await res.json()) as { error: string }).error).toMatch(/trusted tier or above/);
        expect(snippetStore.list('acct1')).toEqual([]);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('403s the master key — cannot own snippets', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const master = readMasterKey(dir);
        const res = await fetch(`${base}/api/snippets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
          body: JSON.stringify({ snippets: [] }),
        });
        expect(res.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('caps at 200 snippets, keeping only the first 200', async () => {
      const { server, base, snippetStore, fakeServer, token } = await startAppAsAccount(dir, 'acct1');
      try {
        const many = Array.from({ length: 205 }, (_, i) => makeSnippet({ id: `s${i}` }));
        const res = await fetch(`${base}/api/snippets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ snippets: many }),
        });
        expect(res.status).toBe(200);
        expect(snippetStore.list('acct1')).toHaveLength(200);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });
  });
});
