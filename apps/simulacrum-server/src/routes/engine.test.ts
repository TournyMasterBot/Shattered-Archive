import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { EngineRebuildStore, type CommandRunner } from '../engine-rebuild.js';
import { RoleStore } from '../role-store.js';
import type { ServiceTier } from '@shatteredarchive/services-server';
import { registerEngineRoutes } from './engine.js';

interface Account {
  accountId: string;
  username: string;
  expiresAt?: string | null;
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'engine-routes-'));
}

function neverCalledRunner(): CommandRunner {
  return async () => {
    throw new Error('unexpected real docker invocation in a route test');
  };
}

function makeConfig(dir: string, overrides: Partial<{ engineReloadEnabled: boolean; engineRebuildEnabled: boolean }> = {}) {
  return {
    engineAreaPath: dir,
    mercMudRepoPath: 'C:/Projects/merc-mud',
    mercMudHostPath: 'C:/Projects/merc-mud',
    engineReloadEnabled: true,
    engineRebuildEnabled: true,
    ...overrides,
  };
}

function startTestApp(
  dir: string,
  opts: {
    account?: Account | null;
    configOverrides?: Partial<{ engineReloadEnabled: boolean; engineRebuildEnabled: boolean }>;
    run?: CommandRunner;
  } = {},
): Promise<{ server: Server; base: string; roleStore: RoleStore; rebuildStore: EngineRebuildStore }> {
  const roleStore = new RoleStore(path.join(dir, 'roles'));
  const config = makeConfig(dir, opts.configOverrides);
  const rebuildStore = new EngineRebuildStore(
    { mercMudRepoPath: config.mercMudRepoPath, mercMudHostPath: config.mercMudHostPath },
    opts.run ?? neverCalledRunner(),
  );
  const app = express();
  const account = opts.account === undefined ? null : opts.account;
  registerEngineRoutes(
    app,
    config,
    roleStore,
    async () => account,
    () => 'irrelevant-token', // resolveAccount above ignores the token entirely for these tests
    rebuildStore,
  );
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, roleStore, rebuildStore });
    });
  });
}

function setTier(roleStore: RoleStore, accountId: string, username: string, tier: ServiceTier): void {
  roleStore.setTier(accountId, username, tier, 'test-setup');
}

const SOON = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
const FAR = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

describe('engine routes', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('POST /api/engine/reload 401s with no signed-in account', async () => {
    const { server, base } = await startTestApp(dir, { account: null });
    try {
      const res = await fetch(`${base}/api/engine/reload`, { method: 'POST' });
      expect(res.status).toBe(401);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/engine/reload 403s a trusted-tier account (below the builder floor)', async () => {
    const account = { accountId: 'a1', username: 'trusted-user' };
    const { server, base, roleStore } = await startTestApp(dir, { account });
    setTier(roleStore, 'a1', 'trusted-user', 'trusted');
    try {
      const res = await fetch(`${base}/api/engine/reload`, { method: 'POST' });
      expect(res.status).toBe(403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/engine/reload succeeds for a builder-tier account and writes the signal file', async () => {
    const account = { accountId: 'a1', username: 'builder-user' };
    const { server, base, roleStore } = await startTestApp(dir, { account });
    setTier(roleStore, 'a1', 'builder-user', 'builder');
    try {
      const res = await fetch(`${base}/api/engine/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'hot', file: 'midgaard.are' }),
      });
      expect(res.status).toBe(202);
      expect(fs.readFileSync(path.join(dir, 'reload.signal'), 'utf8')).toBe('midgaard.are\n');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/engine/reload does NOT require a short-lived token, unlike rebuild', async () => {
    const account = { accountId: 'a1', username: 'builder-user', expiresAt: FAR };
    const { server, base, roleStore } = await startTestApp(dir, { account });
    setTier(roleStore, 'a1', 'builder-user', 'builder');
    try {
      const res = await fetch(`${base}/api/engine/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'copyover' }),
      });
      expect(res.status).toBe(202);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/engine/reload 501s when disabled, even for a builder-tier account', async () => {
    const account = { accountId: 'a1', username: 'builder-user' };
    const { server, base, roleStore } = await startTestApp(dir, { account, configOverrides: { engineReloadEnabled: false } });
    setTier(roleStore, 'a1', 'builder-user', 'builder');
    try {
      const res = await fetch(`${base}/api/engine/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'copyover' }),
      });
      expect(res.status).toBe(501);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/engine/rebuild 403s a builder-tier account with a FOREVER token (never expires)', async () => {
    const account = { accountId: 'a1', username: 'builder-user', expiresAt: null };
    const { server, base, roleStore } = await startTestApp(dir, { account });
    setTier(roleStore, 'a1', 'builder-user', 'builder');
    try {
      const res = await fetch(`${base}/api/engine/rebuild`, { method: 'POST' });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/short-lived token/);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/engine/rebuild 403s a builder-tier account with a token expiring in 30 days (too far out)', async () => {
    const account = { accountId: 'a1', username: 'builder-user', expiresAt: FAR };
    const { server, base, roleStore } = await startTestApp(dir, { account });
    setTier(roleStore, 'a1', 'builder-user', 'builder');
    try {
      const res = await fetch(`${base}/api/engine/rebuild`, { method: 'POST' });
      expect(res.status).toBe(403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/engine/rebuild succeeds for a builder-tier account with a token expiring within 7 days', async () => {
    const account = { accountId: 'a1', username: 'builder-user', expiresAt: SOON };
    const calls: string[][] = [];
    const run: CommandRunner = async (cmd, args) => {
      calls.push(args);
      return { stdout: '', stderr: '' };
    };
    const { server, base, roleStore, rebuildStore } = await startTestApp(dir, { account, run });
    setTier(roleStore, 'a1', 'builder-user', 'builder');
    try {
      const res = await fetch(`${base}/api/engine/rebuild`, { method: 'POST' });
      expect(res.status).toBe(202);
      for (let i = 0; i < 50 && rebuildStore.read()?.phase !== 'complete'; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(rebuildStore.read()?.phase).toBe('complete');
      expect(rebuildStore.read()?.actor).toBe('builder-user');
      expect(calls).toHaveLength(2);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/engine/rebuild 501s when disabled, even for an eligible account — never leaking whether it is on', async () => {
    const account = { accountId: 'a1', username: 'builder-user', expiresAt: SOON };
    const { server, base, roleStore } = await startTestApp(dir, { account, configOverrides: { engineRebuildEnabled: false } });
    setTier(roleStore, 'a1', 'builder-user', 'builder');
    try {
      const res = await fetch(`${base}/api/engine/rebuild`, { method: 'POST' });
      expect(res.status).toBe(501);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/engine/rebuild returns 409 if a rebuild is already in progress', async () => {
    const account = { accountId: 'a1', username: 'builder-user', expiresAt: SOON };
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const run: CommandRunner = async () => {
      await gate;
      return { stdout: '', stderr: '' };
    };
    const { server, base, roleStore, rebuildStore } = await startTestApp(dir, { account, run });
    setTier(roleStore, 'a1', 'builder-user', 'builder');
    try {
      const first = fetch(`${base}/api/engine/rebuild`, { method: 'POST' });
      // Wait for the first request's fire-and-forget pipeline to actually start.
      for (let i = 0; i < 50 && !rebuildStore.isRunning(); i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      const second = await fetch(`${base}/api/engine/rebuild`, { method: 'POST' });
      expect(second.status).toBe(409);
      releaseFirst?.();
      await first;
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/engine/status reports canReload/canRebuild false with no signed-in account', async () => {
    const { server, base } = await startTestApp(dir, { account: null });
    try {
      const res = await fetch(`${base}/api/engine/status`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { canReload: boolean; canRebuild: boolean };
      expect(body.canReload).toBe(false);
      expect(body.canRebuild).toBe(false);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/engine/status distinguishes canReload (no TTL requirement) from canRebuild (TTL required) for the same builder-tier account with a forever token', async () => {
    const account = { accountId: 'a1', username: 'builder-user', expiresAt: null };
    const { server, base, roleStore } = await startTestApp(dir, { account });
    setTier(roleStore, 'a1', 'builder-user', 'builder');
    try {
      const res = await fetch(`${base}/api/engine/status`);
      const body = (await res.json()) as { canReload: boolean; canRebuild: boolean };
      expect(body.canReload).toBe(true);
      expect(body.canRebuild).toBe(false);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
