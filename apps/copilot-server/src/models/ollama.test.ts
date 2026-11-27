import { ModelConfigError, createOllamaClient, isCloudModelName, isLocalModelUrl } from './ollama';

const MODELS = { watcher: 'qwen-watch', agent: 'gemma-agent' };
const ok = (body: unknown): Response => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });

describe('isLocalModelUrl (models are local only, E4)', () => {
  it.each([
    'http://localhost:11434',
    'http://127.0.0.1:11434',
    'http://[::1]:11434',
    'http://host.docker.internal:11434',
    'http://192.168.1.81:11434',
    'http://10.0.0.5',
    'http://172.20.0.2:11434',
    'http://ollama:11434',
    'https://localhost',
  ])('accepts %s', (url) => expect(isLocalModelUrl(url)).toBe(true));

  it.each([
    'https://api.openai.com',
    'https://ollama.com',
    'http://8.8.8.8:11434',
    'http://172.32.0.1',
    'http://example.org',
    'http://user:pass@localhost:11434',
    'ftp://localhost',
    'localhost:11434',
    '',
    'not a url',
  ])('refuses %j', (url) => expect(isLocalModelUrl(url)).toBe(false));
});

describe('isCloudModelName', () => {
  it.each(['llama3:cloud', 'gpt-oss-cloud', 'x:Cloud', 'cloud'])('%s is hosted', (name) => expect(isCloudModelName(name)).toBe(true));
  it.each(['qwen3-coder:30b', 'gemma4:26b', 'cloudy', 'my-cloud-model', ''])('%j is local', (name) => expect(isCloudModelName(name)).toBe(false));
});

describe('createOllamaClient', () => {
  it('refuses a non-local server and a hosted model at construction', () => {
    expect(() => createOllamaClient({ baseUrl: 'https://ollama.com', models: MODELS })).toThrow(ModelConfigError);
    expect(() => createOllamaClient({ baseUrl: 'http://localhost:11434', models: { watcher: 'x:cloud', agent: 'y' } })).toThrow(/hosted/);
    expect(() => createOllamaClient({ baseUrl: 'http://localhost:11434', models: { watcher: '  ', agent: 'y' } })).toThrow(ModelConfigError);
  });

  it('asks the model of the role for JSON, once, not streamed, and returns the text', async () => {
    const seen: { url: string; body: Record<string, unknown> }[] = [];
    const client = createOllamaClient({
      baseUrl: 'http://localhost:11434/',
      models: MODELS,
      fetch: async (url, init) => {
        seen.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return ok({ response: '{"a":1}', done: true });
      },
    });
    expect(await client.generate('watcher', 'hello')).toEqual({ ok: true, text: '{"a":1}' });
    expect(await client.generate('agent', 'again')).toEqual({ ok: true, text: '{"a":1}' });
    expect(seen[0].url).toBe('http://localhost:11434/api/generate');
    expect(seen[0].body).toMatchObject({ model: 'qwen-watch', prompt: 'hello', stream: false, format: 'json' });
    expect(seen[1].body.model).toBe('gemma-agent');
  });

  it('answers http for a non-2xx status', async () => {
    const client = createOllamaClient({ baseUrl: 'http://localhost:11434', models: MODELS, fetch: async () => new Response('boom', { status: 500 }) });
    expect(await client.generate('watcher', 'x')).toEqual({ ok: false, reason: 'http' });
  });

  it.each([
    ['not JSON at all', 'plain words'],
    ['JSON without a response', '{"done":true}'],
    ['a response that is not text', '{"response":5}'],
    ['a JSON value that is not an object', 'null'],
  ])('answers bad-response for %s', async (_label, body) => {
    const client = createOllamaClient({ baseUrl: 'http://localhost:11434', models: MODELS, fetch: async () => ok(body) });
    expect(await client.generate('watcher', 'x')).toEqual({ ok: false, reason: 'bad-response' });
  });

  it('answers too-large for a body over the limit', async () => {
    const client = createOllamaClient({ baseUrl: 'http://localhost:11434', models: MODELS, maxResponseChars: 50, fetch: async () => ok({ response: 'x'.repeat(100) }) });
    expect(await client.generate('watcher', 'x')).toEqual({ ok: false, reason: 'too-large' });
  });

  it('answers network when the server cannot be reached', async () => {
    const client = createOllamaClient({
      baseUrl: 'http://localhost:11434',
      models: MODELS,
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    expect(await client.generate('watcher', 'x')).toEqual({ ok: false, reason: 'network' });
  });

  it('answers timeout when the model takes longer than the limit, and aborts the request', async () => {
    let aborted = false;
    const client = createOllamaClient({
      baseUrl: 'http://localhost:11434',
      models: MODELS,
      timeoutMs: 30,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    });
    expect(await client.generate('watcher', 'x')).toEqual({ ok: false, reason: 'timeout' });
    expect(aborted).toBe(true);
  });

  it('answers aborted when the caller aborts before or during the request', async () => {
    const client = createOllamaClient({
      baseUrl: 'http://localhost:11434',
      models: MODELS,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    const early = new AbortController();
    early.abort();
    expect(await client.generate('watcher', 'x', early.signal)).toEqual({ ok: false, reason: 'aborted' });

    const during = new AbortController();
    const pending = client.generate('agent', 'x', during.signal);
    setTimeout(() => during.abort(), 20);
    expect(await pending).toEqual({ ok: false, reason: 'aborted' });
  });

  it('runs one request at a time and keeps going after a failed one', async () => {
    let active = 0;
    let peak = 0;
    let calls = 0;
    const client = createOllamaClient({
      baseUrl: 'http://localhost:11434',
      models: MODELS,
      fetch: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active--;
        calls++;
        return calls === 1 ? new Response('x', { status: 503 }) : ok({ response: `r${calls}` });
      },
    });
    const results = await Promise.all([client.generate('watcher', 'a'), client.generate('watcher', 'b'), client.generate('agent', 'c')]);
    expect(peak).toBe(1);
    expect(results).toEqual([{ ok: false, reason: 'http' }, { ok: true, text: 'r2' }, { ok: true, text: 'r3' }]);
  });

  it('uses the global fetch and the default limits when none are given', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => ok({ response: 'from global' })) as typeof fetch;
    try {
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434', models: MODELS });
      expect(await client.generate('watcher', 'x')).toEqual({ ok: true, text: 'from global' });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('createOllamaClient: warm (the model is loaded before the first real call)', () => {
  const tags = (...names: string[]): Response => ok({ models: names.map((name) => ({ name })) });
  /** A fake server: the tags answer, and what each generate call (a load) returned. */
  function server(installed: Response | (() => Promise<Response>), load: (body: { model: string }) => Response | Promise<Response> = () => ok({ done: true, response: '' })) {
    const seen: { url: string; body?: { model: string; prompt: string; stream: boolean } }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      seen.push({ url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      if (String(url).endsWith('/api/tags')) return typeof installed === 'function' ? installed() : installed;
      return load(JSON.parse(String(init?.body)));
    }) as typeof fetch;
    return { seen, fetcher };
  }

  it('loads each distinct model once, with an empty prompt and no load-changing option, after listing what is installed', async () => {
    const { seen, fetcher } = server(tags('gemma4:26b'));
    const client = createOllamaClient({ baseUrl: 'http://host.docker.internal:41434/', models: { watcher: 'gemma4:26b', agent: 'gemma4:26b' }, fetch: fetcher });
    expect(await client.warm?.()).toEqual([{ model: 'gemma4:26b', state: 'loaded' }]);
    expect(seen.map((s) => s.url)).toEqual(['http://host.docker.internal:41434/api/tags', 'http://host.docker.internal:41434/api/generate']);
    expect(seen[1].body).toEqual({ model: 'gemma4:26b', prompt: '', stream: false });
  });

  it('reports a model the server does not have as missing, without trying to load it, and loads the other', async () => {
    const { seen, fetcher } = server(tags('qwen-watch'));
    const client = createOllamaClient({ baseUrl: 'http://localhost:11434', models: MODELS, fetch: fetcher });
    expect(await client.warm?.()).toEqual([{ model: 'qwen-watch', state: 'loaded' }, { model: 'gemma-agent', state: 'missing' }]);
    expect(seen.filter((s) => s.url.endsWith('/api/generate')).map((s) => s.body?.model)).toEqual(['qwen-watch']);
  });

  it('counts a name without a tag as installed when the server has it as :latest', async () => {
    const { fetcher } = server(tags('llama3:latest'));
    const client = createOllamaClient({ baseUrl: 'http://localhost:11434', models: { watcher: 'llama3', agent: 'llama3' }, fetch: fetcher });
    expect(await client.warm?.()).toEqual([{ model: 'llama3', state: 'loaded' }]);
  });

  it('is unreachable for every model when the server cannot be reached at all, and fails for a load the server refuses', async () => {
    const down = createOllamaClient({
      baseUrl: 'http://localhost:11434',
      models: MODELS,
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    expect(await down.warm?.()).toEqual([{ model: 'qwen-watch', state: 'unreachable' }, { model: 'gemma-agent', state: 'unreachable' }]);

    const refusing = server(tags('qwen-watch', 'gemma-agent'), ({ model }) => (model === 'qwen-watch' ? new Response('no', { status: 500 }) : ok({ done: true })));
    const client = createOllamaClient({ baseUrl: 'http://localhost:11434', models: MODELS, fetch: refusing.fetcher });
    expect(await client.warm?.()).toEqual([{ model: 'qwen-watch', state: 'failed' }, { model: 'gemma-agent', state: 'loaded' }]);
  });

  it('is unreachable for a model whose load times out or is aborted by the caller', async () => {
    const slow = createOllamaClient({
      baseUrl: 'http://localhost:11434',
      models: { watcher: 'qwen-watch', agent: 'qwen-watch' },
      timeoutMs: 30,
      fetch: ((url: string, init?: RequestInit) =>
        String(url).endsWith('/api/tags')
          ? Promise.resolve(tags('qwen-watch'))
          : new Promise((_resolve, reject) => {
              const abort = (): void => reject(new DOMException('aborted', 'AbortError'));
              if (init?.signal?.aborted) abort(); // as the real fetch does for a signal that is already aborted
              else init?.signal?.addEventListener('abort', abort);
            })) as typeof fetch,
    });
    expect(await slow.warm?.()).toEqual([{ model: 'qwen-watch', state: 'unreachable' }]);

    const stop = new AbortController();
    stop.abort();
    expect(await slow.warm?.(stop.signal)).toEqual([{ model: 'qwen-watch', state: 'unreachable' }]);
  });

  it('tries the load anyway when the list is not the expected answer (an error status, bad JSON, or no list)', async () => {
    for (const answer of [new Response('boom', { status: 500 }), new Response('not json', { status: 200 }), ok({ nothing: true })]) {
      const { seen, fetcher } = server(answer);
      const client = createOllamaClient({ baseUrl: 'http://localhost:11434', models: { watcher: 'qwen-watch', agent: 'qwen-watch' }, fetch: fetcher });
      expect(await client.warm?.()).toEqual([{ model: 'qwen-watch', state: 'loaded' }]);
      expect(seen.some((s) => s.url.endsWith('/api/generate'))).toBe(true);
    }
  });

  it('waits for a call in progress: one model request at a time', async () => {
    let active = 0;
    let peak = 0;
    const client = createOllamaClient({
      baseUrl: 'http://localhost:11434',
      models: { watcher: 'qwen-watch', agent: 'qwen-watch' },
      fetch: (async (url: string) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active--;
        return String(url).endsWith('/api/tags') ? tags('qwen-watch') : ok({ response: 'r' });
      }) as typeof fetch,
    });
    await Promise.all([client.generate('watcher', 'a'), client.warm?.(), client.generate('agent', 'b')]);
    expect(peak).toBe(1);
  });
});
