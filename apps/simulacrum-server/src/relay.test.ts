import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

import { mintAccessCode } from './access-codes.js';
import { createRelay, validateAccessCode, type RelayDeps } from './relay.js';
import type { RoleStore } from './role-store.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'simulacrum-relay-'));
}

function fakeRoleStore(tierByAccount: Record<string, string>): Pick<RoleStore, 'tierFor'> {
  return { tierFor: (accountId: string) => (tierByAccount[accountId] ?? 'user') as never };
}

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

describe('validateAccessCode', () => {
  it('accepts a fresh code for a trusted account', () => {
    const dir = tmpDir();
    const code = mintAccessCode(dir, 'acct-1', 'alice', 5 * 60 * 1000);
    const roleStore = fakeRoleStore({ 'acct-1': 'trusted' }) as RoleStore;
    expect(validateAccessCode({ accessCodesPath: dir, roleStore }, code)).toEqual({
      accountId: 'acct-1',
      username: 'alice',
    });
  });

  it('rejects a code whose account has since been demoted below trusted (live re-check)', () => {
    const dir = tmpDir();
    const code = mintAccessCode(dir, 'acct-1', 'alice', 5 * 60 * 1000);
    const roleStore = fakeRoleStore({ 'acct-1': 'user' }) as RoleStore;
    expect(validateAccessCode({ accessCodesPath: dir, roleStore }, code)).toBeNull();
  });

  it('rejects a bogus code', () => {
    const dir = tmpDir();
    const roleStore = fakeRoleStore({}) as RoleStore;
    expect(validateAccessCode({ accessCodesPath: dir, roleStore }, 'not-a-real-code-000000')).toBeNull();
  });
});

describe('createRelay', () => {
  let upstream: net.Server;
  let upstreamPort: number;
  let upstreamConnections: number;

  beforeEach(async () => {
    upstreamConnections = 0;
    upstream = net.createServer((socket) => {
      upstreamConnections += 1;
      // Stand-in for merc-mud: echo everything back, prefixed, so the test can tell the
      // byte stream really crossed the relay (same "throwaway listener" technique the
      // plan's Step 1 Verify calls for).
      socket.on('data', (chunk: Buffer) => socket.write(Buffer.concat([Buffer.from('echo:'), chunk])));
    });
    upstreamPort = await listen(upstream);
  });

  afterEach(() => {
    upstream.close();
  });

  function deps(dir: string, extra?: Partial<RelayDeps>): RelayDeps {
    return {
      accessCodesPath: dir,
      roleStore: fakeRoleStore({ 'acct-1': 'trusted' }) as RoleStore,
      mercMudHost: '127.0.0.1',
      mercMudPort: upstreamPort,
      promptTimeoutMs: 2000,
      ...extra,
    };
  }

  it('rejects a connection with no code and never dials the upstream', async () => {
    const dir = tmpDir();
    const { server } = createRelay(deps(dir));
    const port = await listen(server);

    const received = await new Promise<string>((resolve) => {
      const client = net.connect(port, '127.0.0.1');
      let buf = '';
      client.on('data', (chunk) => (buf += chunk.toString()));
      client.on('close', () => resolve(buf));
      client.end('\n'); // blank line — no code at all
    });

    expect(received).toContain('Access denied');
    expect(upstreamConnections).toBe(0);
    server.close();
  });

  it('admits a valid code and pipes bytes both directions', async () => {
    const dir = tmpDir();
    const code = mintAccessCode(dir, 'acct-1', 'alice', 5 * 60 * 1000);
    const { server } = createRelay(deps(dir));
    const port = await listen(server);

    const received = await new Promise<string>((resolve) => {
      const client = net.connect(port, '127.0.0.1');
      let buf = '';
      client.on('data', (chunk) => {
        buf += chunk.toString();
        if (buf.includes('echo:hello')) {
          client.end();
          resolve(buf);
        }
      });
      client.write(`${code}\n`);
      // Give the relay a beat to admit before sending the "user" payload.
      setTimeout(() => client.write('hello'), 100);
    });

    expect(received).toContain('echo:hello');
    expect(upstreamConnections).toBe(1);
    server.close();
  });

  it('sends the #SIMACCT preamble as the literal first bytes, before anything the human types', async () => {
    const dir = tmpDir();
    const code = mintAccessCode(dir, 'acct-1', 'alice', 5 * 60 * 1000);

    // A raw capture stand-in for merc-mud (same throwaway-listener technique as the sibling
    // plan's Step 1) — records exactly what arrives, in order, rather than echoing.
    let rawReceived = '';
    const capture = net.createServer((socket) => {
      socket.on('data', (chunk) => (rawReceived += chunk.toString()));
    });
    const capturePort = await listen(capture);

    const { server } = createRelay(deps(dir, { mercMudPort: capturePort }));
    const port = await listen(server);

    await new Promise<void>((resolve) => {
      const client = net.connect(port, '127.0.0.1');
      client.write(`${code}\n`);
      setTimeout(() => {
        client.write('humantyped');
        setTimeout(() => {
          client.end();
          resolve();
        }, 100);
      }, 100);
    });

    expect(rawReceived.startsWith('#SIMACCT acct-1 alice\n')).toBe(true);
    expect(rawReceived).toBe('#SIMACCT acct-1 alice\nhumantyped');
    server.close();
    capture.close();
  });
});
