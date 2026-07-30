import type { AddressInfo } from 'net';

import { createExpressService, parseCorsOrigin } from './express-service.js';

describe('parseCorsOrigin', () => {
  it('defaults to localhost-only when unset', () => {
    const origin = parseCorsOrigin(undefined);
    expect(origin).toBeInstanceOf(RegExp);
    expect((origin as RegExp).test('http://localhost:5173')).toBe(true);
    expect((origin as RegExp).test('https://evil.example')).toBe(false);
  });

  it('returns the literal reflect-all sentinel for "*"', () => {
    expect(parseCorsOrigin('*')).toBe(true);
  });

  it('builds an allowlist validator for a comma-separated list', () => {
    const origin = parseCorsOrigin('https://a.example,https://b.example') as (
      o: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;
    const results: boolean[] = [];
    origin('https://a.example', (_e, allow) => results.push(!!allow));
    origin('https://evil.example', (_e, allow) => results.push(!!allow));
    expect(results).toEqual([true, false]);
  });
});

describe('createExpressService CORS credentials (CWE-942 hardening)', () => {
  async function startWithOrigin(corsOrigin: Parameters<typeof createExpressService>[0]['corsOrigin']): Promise<{ base: string; close: () => Promise<void> }> {
    const service = createExpressService(
      { name: 'test-service', port: 0, corsOrigin },
      (app) => app.get('/ping', (_req, res) => res.json({ ok: true })),
    );
    const server = await service.start();
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { base, close: () => service.stop() };
  }

  it('never sends Access-Control-Allow-Credentials for a reflect-all (wildcard) origin', async () => {
    const { base, close } = await startWithOrigin(true);
    try {
      const res = await fetch(`${base}/ping`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://anything.example', 'Access-Control-Request-Method': 'GET' },
      });
      // The permissive origin itself still works (reflected) — only the
      // dangerous credentials pairing is removed.
      expect(res.headers.get('access-control-allow-origin')).toBe('https://anything.example');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    } finally {
      await close();
    }
  });

  it('still sends Access-Control-Allow-Credentials for a bounded origin (unaffected by the fix)', async () => {
    const { base, close } = await startWithOrigin(/^https:\/\/allowed\.example$/);
    try {
      const res = await fetch(`${base}/ping`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://allowed.example', 'Access-Control-Request-Method': 'GET' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    } finally {
      await close();
    }
  });

  it('still sends Access-Control-Allow-Credentials for the default localhost origin', async () => {
    const { base, close } = await startWithOrigin(undefined);
    try {
      const res = await fetch(`${base}/ping`, {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    } finally {
      await close();
    }
  });
});
