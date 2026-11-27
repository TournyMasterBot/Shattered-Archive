import { ConfigError, DEFAULT_ALLOWED_ORIGINS, DEFAULT_PORT, isLocalListenHost, isLocalOrigin, loadConfig } from './config';

const ENABLED = { COPILOT_ENABLED: 'true' };

describe('loadConfig: refuses unless Copilot is explicitly enabled (L2)', () => {
  it.each([undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true'])('COPILOT_ENABLED=%p is refused', (value) => {
    expect(() => loadConfig({ COPILOT_ENABLED: value })).toThrow(ConfigError);
    expect(() => loadConfig({ COPILOT_ENABLED: value })).toThrow(/local-only/);
  });

  it('refuses an empty environment', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it('starts with the documented defaults when enabled', () => {
    expect(loadConfig(ENABLED)).toEqual({
      port: 65100,
      host: '0.0.0.0',
      dataDir: '/data',
      logDir: '/logs',
      matrixPath: '/matrix/test-character-matrix.json',
      allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
      staleSeconds: 60,
      model: { backend: 'none', timeoutMs: 60_000 },
      worldBaseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
      hintsLocal: false,
    });
    expect(DEFAULT_PORT).toBe(65100);
  });

  it('allows the hint tiers to use the local model only when COPILOT_HINTS_LOCAL is exactly 1', () => {
    expect(loadConfig(ENABLED).hintsLocal).toBe(false);
    expect(loadConfig({ ...ENABLED, COPILOT_HINTS_LOCAL: '1' }).hintsLocal).toBe(true);
    expect(loadConfig({ ...ENABLED, COPILOT_HINTS_LOCAL: ' 1 ' }).hintsLocal).toBe(true);
    for (const other of ['', '0', 'true', 'yes']) expect(loadConfig({ ...ENABLED, COPILOT_HINTS_LOCAL: other }).hintsLocal).toBe(false);
  });

  it('reads the world memory fixture rule (P5) from the environment, and falls back to the defaults for blanks', () => {
    expect(
      loadConfig({ ...ENABLED, COPILOT_WORLD_MIN_VISITS: '8', COPILOT_WORLD_MIN_DAYS: '4', COPILOT_WORLD_MIN_RATIO: '0.9', COPILOT_WORLD_DEMOTE_AFTER: '6' }).worldBaseline,
    ).toEqual({ minVisits: 8, minDays: 4, minRatio: 0.9, demoteAfterMisses: 6 });
    expect(loadConfig({ ...ENABLED, COPILOT_WORLD_MIN_VISITS: '', COPILOT_WORLD_MIN_RATIO: '  ' }).worldBaseline).toEqual({ minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 });
    expect(loadConfig({ ...ENABLED, COPILOT_WORLD_MIN_RATIO: '1' }).worldBaseline.minRatio).toBe(1);
  });

  it('refuses a fixture rule value that is not a usable number, naming the variable', () => {
    for (const [name, bad] of [
      ['COPILOT_WORLD_MIN_VISITS', '0'],
      ['COPILOT_WORLD_MIN_VISITS', '1001'],
      ['COPILOT_WORLD_MIN_VISITS', '2.5'],
      ['COPILOT_WORLD_MIN_DAYS', 'many'],
      ['COPILOT_WORLD_MIN_DAYS', '366'],
      ['COPILOT_WORLD_DEMOTE_AFTER', '-1'],
      ['COPILOT_WORLD_MIN_RATIO', '0'],
      ['COPILOT_WORLD_MIN_RATIO', '1.1'],
      ['COPILOT_WORLD_MIN_RATIO', 'high'],
    ] as const) {
      expect(() => loadConfig({ ...ENABLED, [name]: bad })).toThrow(new RegExp(name));
    }
  });

  it('reads the stale limit and refuses a value outside the range the policy settings allow', () => {
    expect(loadConfig({ ...ENABLED, COPILOT_STALE_SECONDS: '5' }).staleSeconds).toBe(5);
    expect(loadConfig({ ...ENABLED, COPILOT_STALE_SECONDS: '3600' }).staleSeconds).toBe(3600);
    expect(loadConfig({ ...ENABLED, COPILOT_STALE_SECONDS: '' }).staleSeconds).toBe(60);
    for (const bad of ['4', '3601', '1.5', 'abc', '-10', '0']) {
      expect(() => loadConfig({ ...ENABLED, COPILOT_STALE_SECONDS: bad })).toThrow(/COPILOT_STALE_SECONDS/);
    }
  });

  it('returns a copy of the default origins that cannot change the defaults', () => {
    loadConfig(ENABLED).allowedOrigins.push('http://localhost:1');
    expect(loadConfig(ENABLED).allowedOrigins).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });
});

describe('loadConfig: models are local only (E4)', () => {
  const OLLAMA = { ...ENABLED, COPILOT_MODEL_BACKEND: 'ollama', COPILOT_OLLAMA_URL: 'http://host.docker.internal:11434', COPILOT_WATCHER_MODEL: 'qwen3:8b', COPILOT_AGENT_MODEL: 'gemma4:26b' };

  it('has no model by default, and accepts the fake backend with no server', () => {
    expect(loadConfig(ENABLED).model).toEqual({ backend: 'none', timeoutMs: 60_000 });
    expect(loadConfig({ ...ENABLED, COPILOT_MODEL_BACKEND: 'fake' }).model).toEqual({ backend: 'fake', timeoutMs: 60_000 });
  });

  it('accepts a local Ollama server with a model for each role, and a timeout', () => {
    expect(loadConfig({ ...OLLAMA, COPILOT_MODEL_TIMEOUT_MS: '120000' }).model).toEqual({
      backend: 'ollama',
      ollamaUrl: 'http://host.docker.internal:11434',
      watcherModel: 'qwen3:8b',
      agentModel: 'gemma4:26b',
      timeoutMs: 120_000,
    });
  });

  it.each([
    [{ COPILOT_MODEL_BACKEND: 'openai' }, /must be none, fake or ollama/],
    [{ COPILOT_OLLAMA_URL: 'https://ollama.com' }, /local model server/],
    [{ COPILOT_OLLAMA_URL: undefined }, /local model server/],
    [{ COPILOT_WATCHER_MODEL: '' }, /must both be set/],
    [{ COPILOT_WATCHER_MODEL: undefined }, /must both be set/],
    [{ COPILOT_AGENT_MODEL: undefined }, /must both be set/],
    [{ COPILOT_WATCHER_MODEL: 'gpt-oss:cloud' }, /hosted \(cloud\)/],
    [{ COPILOT_AGENT_MODEL: 'big-cloud' }, /hosted \(cloud\)/],
    [{ COPILOT_MODEL_TIMEOUT_MS: '999' }, /COPILOT_MODEL_TIMEOUT_MS/],
    [{ COPILOT_MODEL_TIMEOUT_MS: '600001' }, /COPILOT_MODEL_TIMEOUT_MS/],
    [{ COPILOT_MODEL_TIMEOUT_MS: 'soon' }, /COPILOT_MODEL_TIMEOUT_MS/],
  ])('refuses %j', (override, message) => {
    expect(() => loadConfig({ ...OLLAMA, ...override })).toThrow(message);
  });

  it('reads the optional archive URL and spheres file, and refuses bad ones', () => {
    expect(loadConfig(ENABLED)).not.toHaveProperty('archiveUrl');
    expect(loadConfig({ ...ENABLED, COPILOT_ARCHIVE_URL: ' ', COPILOT_SPHERES_PATH: '' })).not.toHaveProperty('spheresPath');
    expect(loadConfig({ ...ENABLED, COPILOT_ARCHIVE_URL: 'https://shatteredarchive.com', COPILOT_SPHERES_PATH: '/spheres/spheres.json' })).toMatchObject({
      archiveUrl: 'https://shatteredarchive.com',
      spheresPath: '/spheres/spheres.json',
    });
    for (const bad of ['ftp://x', 'not a url', 'https://user:pw@shatteredarchive.com']) {
      expect(() => loadConfig({ ...ENABLED, COPILOT_ARCHIVE_URL: bad })).toThrow(/COPILOT_ARCHIVE_URL/);
    }
    expect(() => loadConfig({ ...ENABLED, COPILOT_SPHERES_PATH: 'spheres.json' })).toThrow(/COPILOT_SPHERES_PATH must be an absolute path/);
  });
});

describe('loadConfig: the listen address and port', () => {
  it.each(['127.0.0.1', 'localhost', '::1', '10.1.2.3', '192.168.1.5', '172.16.0.1', '172.31.255.255', '0.0.0.0', ' 127.0.0.1 '])(
    'accepts %p',
    (host) => {
      expect(loadConfig({ ...ENABLED, COPILOT_LISTEN_HOST: host }).host).toBe(host.trim());
    },
  );

  it.each(['8.8.8.8', '203.0.113.9', '172.32.0.1', '172.15.255.255', 'example.com', '', '::', '2001:db8::1', '11.0.0.1', '192.169.0.1'])(
    'refuses a public or unknown listen address %p',
    (host) => {
      expect(() => loadConfig({ ...ENABLED, COPILOT_LISTEN_HOST: host })).toThrow(/never a public one/);
    },
  );

  it('accepts a valid port and refuses the rest, including 66000 which is above the last TCP port', () => {
    expect(loadConfig({ ...ENABLED, COPILOT_PORT: '8080' }).port).toBe(8080);
    expect(loadConfig({ ...ENABLED, COPILOT_PORT: '' }).port).toBe(65100);
    expect(loadConfig({ ...ENABLED, COPILOT_PORT: '65535' }).port).toBe(65535);
    for (const bad of ['0', '-1', '65536', '66000', 'abc', '1.5', '8080x']) {
      expect(() => loadConfig({ ...ENABLED, COPILOT_PORT: bad })).toThrow(/COPILOT_PORT/);
    }
  });

  it('isLocalListenHost agrees', () => {
    expect(isLocalListenHost('10.0.0.1')).toBe(true);
    expect(isLocalListenHost('1.1.1.1')).toBe(false);
  });
});

describe('loadConfig: data and log folders', () => {
  it('accepts absolute POSIX and Windows paths', () => {
    expect(loadConfig({ ...ENABLED, COPILOT_DATA_DIR: '/srv/copilot', COPILOT_LOG_DIR: 'C:/logs' })).toMatchObject({
      dataDir: '/srv/copilot',
      logDir: 'C:/logs',
    });
  });

  it('refuses a relative path, which could land inside a repository', () => {
    expect(() => loadConfig({ ...ENABLED, COPILOT_DATA_DIR: 'data' })).toThrow(/COPILOT_DATA_DIR must be an absolute path/);
    expect(() => loadConfig({ ...ENABLED, COPILOT_LOG_DIR: '../logs' })).toThrow(/COPILOT_LOG_DIR must be an absolute path/);
    expect(() => loadConfig({ ...ENABLED, COPILOT_MATRIX_PATH: 'matrix.json' })).toThrow(/COPILOT_MATRIX_PATH must be an absolute path/);
  });

  it('reads the test-matrix path', () => {
    expect(loadConfig({ ...ENABLED, COPILOT_MATRIX_PATH: '/m/matrix.json' }).matrixPath).toBe('/m/matrix.json');
  });
});

describe('loadConfig: allowed origins', () => {
  it('accepts a list of local and dev-domain origins, trimming spaces and dropping blanks', () => {
    const origins = 'https://game-client.shatteredarchive.dev, http://localhost:30080,,  http://192.168.1.20:30080 ';
    expect(loadConfig({ ...ENABLED, COPILOT_ALLOWED_ORIGINS: origins }).allowedOrigins).toEqual([
      'https://game-client.shatteredarchive.dev',
      'http://localhost:30080',
      'http://192.168.1.20:30080',
    ]);
  });

  it('uses the defaults for an empty or blank list', () => {
    expect(loadConfig({ ...ENABLED, COPILOT_ALLOWED_ORIGINS: '' }).allowedOrigins).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(loadConfig({ ...ENABLED, COPILOT_ALLOWED_ORIGINS: '   ' }).allowedOrigins).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });

  it.each([
    '*',
    'https://evil.example',
    'https://shatteredarchive.dev.evil.com',
    'https://shatteredarchive.com',
    'http://game-client.shatteredarchive.dev/',
    'http://localhost:30080/path',
    'ftp://localhost',
    'null',
    'not a url',
    'http://8.8.8.8',
    'http://172.32.0.1',
  ])('refuses %p', (origin) => {
    expect(() => loadConfig({ ...ENABLED, COPILOT_ALLOWED_ORIGINS: `http://localhost:1,${origin}` })).toThrow(/local or shatteredarchive.dev origins/);
  });

  it('isLocalOrigin accepts the bare dev domain, subdomains, localhost and private addresses only', () => {
    expect(isLocalOrigin('https://shatteredarchive.dev')).toBe(true);
    expect(isLocalOrigin('https://copilot.shatteredarchive.dev')).toBe(true);
    expect(isLocalOrigin('http://10.0.0.5:3000')).toBe(true);
    expect(isLocalOrigin('https://notshatteredarchive.dev')).toBe(false);
  });
});
