import { DEFAULT_API, isAllowedApi, runCli, type CliIo } from './cli';

interface Call {
  url: string;
  method?: string;
  body?: unknown;
}

function setup(reply: { status?: number; body?: unknown; throws?: boolean; badJson?: boolean } = {}, files: Record<string, string> = {}, env: Record<string, string | undefined> = {}) {
  const calls: Call[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    fetch: (async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      if (reply.throws) throw new TypeError('network');
      return { status: reply.status ?? 200, json: async () => (reply.badJson ? Promise.reject(new SyntaxError('x')) : (reply.body ?? {})) } as unknown as Response;
    }) as typeof fetch,
    readFile: async (path) => {
      if (!(path in files)) throw new Error('ENOENT');
      return files[path];
    },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env,
  };
  return { io, calls, out, err };
}

describe('isAllowedApi', () => {
  it.each(['http://localhost:65100', 'http://127.0.0.1:65100', 'http://192.168.1.81:65100', 'http://10.0.0.5', 'https://copilot.shatteredarchive.dev', 'http://copilot-server:65100', 'https://a.b.shatteredarchive.dev/x'])('allows %s', (url) => {
    expect(isAllowedApi(url)).toBe(true);
  });
  it.each(['https://example.com', 'https://shatteredarchive.dev.evil.com', 'https://evilshatteredarchive.dev', 'ftp://localhost', 'https://u:p@copilot.shatteredarchive.dev', 'http://copilot.shatteredarchive.dev.evil.com', 'nonsense', ''])('refuses %s', (url) => {
    expect(isAllowedApi(url)).toBe(false);
  });
});

describe('runCli: export', () => {
  it('asks for a bundle of the open tickets and prints where it went and the summary', async () => {
    const t = setup({ status: 201, body: { written: true, id: 'b1', folder: 'bundles/b1', tickets: 2, summary: '# Copilot audit bundle b1' } });
    expect(await runCli(['export'], t.io)).toBe(0);
    expect(t.calls).toEqual([{ url: `${DEFAULT_API}/bundles`, method: 'POST', body: {} }]);
    expect(t.out).toEqual(['Bundle b1 written to bundles/b1 (2 tickets).', '# Copilot audit bundle b1']);
  });

  it('names tickets with --ticket, as many as given', async () => {
    const t = setup({ status: 201, body: { written: true, id: 'b1', folder: 'f', tickets: 2, summary: 's' } });
    await runCli(['export', '--ticket', 't1', '--ticket', 't2'], t.io);
    expect(t.calls[0].body).toEqual({ ticketIds: ['t1', 't2'] });
  });

  it('ignores the first `--` that pnpm may pass on before the arguments, and no other', async () => {
    const t = setup({ status: 201, body: { written: true, id: 'b1', folder: 'f', tickets: 1, summary: 's' } });
    expect(await runCli(['export', '--', '--ticket', 't1'], t.io)).toBe(0);
    expect(t.calls[0].body).toEqual({ ticketIds: ['t1'] });
    const second = setup();
    expect(await runCli(['export', '--', '--', '--ticket', 't1'], second.io)).toBe(2); // a second `--` is a mistake
  });

  it('says so when there is nothing to export', async () => {
    const t = setup({ status: 200, body: { written: false, tickets: 0 } });
    expect(await runCli(['export'], t.io)).toBe(0);
    expect(t.out).toEqual(['No open tickets: nothing written.']);
  });

  it.each([['--ticket'], ['--bogus', 'x'], ['t1']])('a bad command line (%j) is a usage error and calls nothing', async (...args) => {
    const t = setup();
    expect(await runCli(['export', ...args], t.io)).toBe(2);
    expect(t.calls).toEqual([]);
    expect(t.err[0]).toContain('usage: teacher');
  });

  it('reports the server’s refusal with its reason and details', async () => {
    const t = setup({ status: 404, body: { error: 'unknown ticket', details: ['a', 'b'] } });
    expect(await runCli(['export', '--ticket', 'nope'], t.io)).toBe(1);
    expect(t.err).toEqual(['the server answered 404: unknown ticket (a; b)']);
  });
});

describe('runCli: import', () => {
  const finding = JSON.stringify({ id: 'f1', ticketId: 't1' });

  it('sends the file’s finding and says what happens next', async () => {
    const t = setup({ status: 201, body: { ok: true, id: 'f1', written: true } }, { '/tmp/f.json': finding });
    expect(await runCli(['import', '/tmp/f.json'], t.io)).toBe(0);
    expect(t.calls).toEqual([{ url: `${DEFAULT_API}/findings`, method: 'POST', body: { id: 'f1', ticketId: 't1' } }]);
    expect(t.out[0]).toContain('Finding f1 stored');
    expect(t.out[0]).toContain('Tell the owner');
  });

  it('says a finding was already stored', async () => {
    const t = setup({ status: 200, body: { ok: true, id: 'f1', written: false } }, { '/tmp/f.json': finding });
    await runCli(['import', '/tmp/f.json'], t.io);
    expect(t.out[0]).toContain('was already stored');
  });

  it('a file that is missing or not JSON is a mistake, and nothing is sent', async () => {
    const missing = setup();
    expect(await runCli(['import', '/tmp/none.json'], missing.io)).toBe(2);
    const broken = setup({}, { '/tmp/b.json': '{oops' });
    expect(await runCli(['import', '/tmp/b.json'], broken.io)).toBe(2);
    expect(missing.calls.concat(broken.calls)).toEqual([]);
    expect(broken.err).toEqual(['the finding file cannot be read or is not JSON']);
  });

  it('needs exactly one file, and reports a refusal', async () => {
    expect(await runCli(['import'], setup().io)).toBe(2);
    expect(await runCli(['import', 'a', 'b'], setup().io)).toBe(2);
    const t = setup({ status: 400, body: { error: 'invalid finding', details: ['verdict is not one of the allowed values'] } }, { '/tmp/f.json': finding });
    expect(await runCli(['import', '/tmp/f.json'], t.io)).toBe(1);
    expect(t.err[0]).toContain('400: invalid finding (verdict is not one of the allowed values)');
  });
});

describe('runCli: accept', () => {
  it('sends the owner’s acceptance for the ticket, with the id encoded', async () => {
    const t = setup({ body: { ok: true, written: true, lessonsChanged: 2 } });
    expect(await runCli(['accept', 't 1'], t.io)).toBe(0);
    expect(t.calls).toEqual([{ url: `${DEFAULT_API}/tickets/t%201/accept`, method: 'POST', body: { acceptedBy: 'owner' } }]);
    expect(t.out).toEqual(['Accepted. 2 proposed lesson(s) settled.']);
  });

  it('says when it was already accepted, refuses a bad command line, and reports a refusal', async () => {
    const again = setup({ body: { ok: true, written: false, lessonsChanged: 0 } });
    await runCli(['accept', 't1'], again.io);
    expect(again.out).toEqual(['Already accepted; nothing changed.']);
    expect(await runCli(['accept'], setup().io)).toBe(2);
    const refused = setup({ status: 409, body: { error: 'the ticket has no finding to accept' } });
    expect(await runCli(['accept', 't1'], refused.io)).toBe(1);
    expect(refused.err).toEqual(['the server answered 409: the ticket has no finding to accept']);
  });
});

describe('runCli: persona-feedback', () => {
  it('files a persona-feedback ticket for the character, with the words of the why joined', async () => {
    const t = setup({ status: 201, body: { ok: true, id: 'pf-x', written: true } });
    t.io.now = () => 1_700_000_000_000;
    expect(await runCli(['persona-feedback', 'Agate-F', 'voice', 'She', 'never', 'sounds', 'this', 'polite.'], t.io)).toBe(0);
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toMatchObject({ url: `${DEFAULT_API}/tickets`, method: 'POST' });
    expect(t.calls[0].body).toEqual({
      id: expect.stringMatching(/^pf-[0-9a-z]+-[0-9a-z]{5}$/),
      createdAt: 1_700_000_000_000,
      character: 'Agate-F',
      reason: 'persona-feedback',
      sphere: 'interaction',
      kind: 'unknown',
      situationKey: 'persona:Agate-F',
      summary: 'Persona feedback for Agate-F; field: voice; why: She never sounds this polite.',
      status: 'open',
    });
    expect(t.out).toEqual(['Filed pf-x: persona feedback for Agate-F (voice). It waits for a teaching session.']);
  });

  it('uses the real clock when none is given', async () => {
    const t = setup({ status: 201, body: { ok: true, id: 'pf-x', written: true } });
    const before = Date.now();
    await runCli(['persona-feedback', 'Agate-F', 'unknown', 'Off.'], t.io);
    expect((t.calls[0].body as { createdAt: number }).createdAt).toBeGreaterThanOrEqual(before);
  });

  it.each([
    ['nothing'],
    ['only a codename', 'Agate-F'],
    ['no why', 'Agate-F', 'voice'],
    ['a codename that is not a reference', 'agate', 'voice', 'x'],
    ['a field that is not a persona field', 'Agate-F', 'mood', 'x'],
    ['a why that is too long', 'Agate-F', 'voice', 'x'.repeat(401)],
  ])('refuses %s as a usage error and files nothing', async (_label, ...args) => {
    const t = setup();
    expect(await runCli(['persona-feedback', ...args], t.io)).toBe(2);
    expect(t.calls).toEqual([]);
    expect(t.err[0]).toContain('usage: teacher');
    expect(t.err[0]).toContain('the fields are: role, stance, voice');
  });

  it('reports a refusal, and an unreachable server', async () => {
    const refused = setup({ status: 400, body: { error: 'invalid ticket', details: ['x'] } });
    expect(await runCli(['persona-feedback', 'Agate-F', 'voice', 'Off.'], refused.io)).toBe(1);
    expect(refused.err).toEqual(['the server answered 400: invalid ticket (x)']);
    const down = setup({ throws: true });
    expect(await runCli(['persona-feedback', 'Agate-F', 'voice', 'Off.'], down.io)).toBe(1);
  });
});

describe('runCli: metrics and the rest', () => {
  it('prints the totals', async () => {
    const t = setup({ body: { totals: { open: 1 }, scenarios: [] } });
    expect(await runCli(['metrics'], t.io)).toBe(0);
    expect(t.calls).toEqual([{ url: `${DEFAULT_API}/metrics/training`, method: 'GET', body: undefined }]);
    expect(t.out).toEqual(['{"open":1}']);
    expect(await runCli(['metrics'], setup({ status: 503, body: { error: 'x' } }).io)).toBe(1);
    expect(await runCli(['metrics', 'extra'], setup().io)).toBe(2);
  });

  it('an unknown command or none prints the usage', async () => {
    const t = setup();
    expect(await runCli([], t.io)).toBe(2);
    expect(await runCli(['frobnicate'], t.io)).toBe(2);
    expect(t.err).toHaveLength(2);
    expect(t.calls).toEqual([]);
  });

  it('a server that cannot be reached is said plainly, for every command', async () => {
    for (const argv of [['export'], ['accept', 't1'], ['metrics']]) {
      const t = setup({ throws: true });
      expect(await runCli(argv, t.io)).toBe(1);
      expect(t.err).toEqual(['the Copilot server cannot be reached; tickets wait, nothing is lost']);
    }
    const t = setup({ throws: true }, { '/tmp/f.json': '{}' });
    expect(await runCli(['import', '/tmp/f.json'], t.io)).toBe(1);
  });

  it('a certificate the machine does not trust is named as such, not reported as a server that is down', async () => {
    const t = setup();
    t.io.fetch = (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } });
    }) as typeof fetch;
    expect(await runCli(['export'], t.io)).toBe(1);
    expect(t.err[0]).toContain('certificate this machine does not trust');
    expect(t.err[0]).toContain('mkcert -install');
    // an error with some other cause, or none, is an unreachable server
    for (const error of [Object.assign(new TypeError('x'), { cause: { code: 'ECONNREFUSED' } }), Object.assign(new TypeError('x'), { cause: {} }), 'plain']) {
      const other = setup();
      other.io.fetch = (async () => {
        throw error;
      }) as typeof fetch;
      await runCli(['metrics'], other.io);
      expect(other.err[0]).toContain('cannot be reached');
    }
  });

  it('an answer that is not JSON still gives a refusal with no reason', async () => {
    const t = setup({ status: 502, badJson: true });
    expect(await runCli(['export'], t.io)).toBe(1);
    expect(t.err).toEqual(['the server answered 502: no reason given']);
  });

  it('an answer that is JSON but not an object is treated as empty', async () => {
    const t = setup({ status: 200, body: 'text' });
    expect(await runCli(['export'], t.io)).toBe(0);
    expect(t.out).toEqual(['No open tickets: nothing written.']);
  });

  it('uses COPILOT_API when it is allowed, and refuses to talk to anything else', async () => {
    const ok = setup({ body: { totals: {} } }, {}, { COPILOT_API: 'http://localhost:65100/' });
    await runCli(['metrics'], ok.io);
    expect(ok.calls[0].url).toBe('http://localhost:65100/metrics/training');
    const bad = setup({}, {}, { COPILOT_API: 'https://example.com' });
    expect(await runCli(['export'], bad.io)).toBe(2);
    expect(bad.calls).toEqual([]);
    expect(bad.err).toEqual(['COPILOT_API must be this machine, a private network or *.shatteredarchive.dev']);
  });
});
