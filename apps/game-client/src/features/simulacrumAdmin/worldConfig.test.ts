import { DEFAULT_WORLD_BASE, WORLD_BASE_STORAGE_KEY, normalizeWorldBase, readWorldBase, readWorldBaseFrom } from './worldConfig';

describe('normalizeWorldBase', () => {
  it.each([
    [DEFAULT_WORLD_BASE, 'https://simulacrum-admin.shatteredarchive.dev'],
    ['  https://Simulacrum-Admin.ShatteredArchive.dev/  ', 'https://simulacrum-admin.shatteredarchive.dev'],
    ['http://localhost:30080', 'http://localhost:30080'],
    ['http://127.0.0.1:8080/', 'http://127.0.0.1:8080'],
    ['http://192.168.0.10', 'http://192.168.0.10'],
    ['https://10.1.2.3:8443', 'https://10.1.2.3:8443'],
    ['http://172.20.0.5', 'http://172.20.0.5'],
  ])('accepts %j as %j', (input, expected) => {
    expect(normalizeWorldBase(input)).toBe(expected);
  });

  it.each([
    ['a public host', 'https://example.com'],
    ['a public address', 'http://8.8.8.8'],
    ['a look-alike of the dev domain', 'https://shatteredarchive.dev.evil.example'],
    ['a path', 'https://simulacrum-admin.shatteredarchive.dev/api'],
    ['a query', 'https://simulacrum-admin.shatteredarchive.dev/?x=1'],
    ['a fragment', 'https://simulacrum-admin.shatteredarchive.dev/#x'],
    ['credentials', 'https://user:pass@simulacrum-admin.shatteredarchive.dev'],
    ['a username alone', 'https://user@localhost'],
    ['another scheme', 'ftp://localhost'],
    ['an IPv6 address', 'http://[::1]'],
    ['not a URL', 'not a url'],
    ['an empty string', ''],
  ])('refuses %s', (_what, input) => {
    expect(normalizeWorldBase(input)).toBeUndefined();
  });

  it('refuses a value that is not a string', () => {
    for (const value of [undefined, null, 5, {}, ['http://localhost']]) expect(normalizeWorldBase(value)).toBeUndefined();
  });
});

describe('readWorldBase', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('uses the default with no storage or nothing stored', () => {
    expect(readWorldBase(undefined)).toBe(DEFAULT_WORLD_BASE);
    expect(readWorldBase({ getItem: () => null })).toBe(DEFAULT_WORLD_BASE);
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses a valid stored override, normalised', () => {
    const storage = { getItem: (key: string) => (key === WORLD_BASE_STORAGE_KEY ? 'http://localhost:30080/' : null) };
    expect(readWorldBase(storage)).toBe('http://localhost:30080');
  });

  it('ignores a stored value that is not an allowed local address, with one fixed warning that does not repeat the value', () => {
    expect(readWorldBase({ getItem: () => 'https://example.com' })).toBe(DEFAULT_WORLD_BASE);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain('example.com');
  });

  it('survives a blocked storage with one fixed warning', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readWorldBase(storage)).toBe(DEFAULT_WORLD_BASE);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('readWorldBaseFrom', () => {
  it('reads the override from a window’s storage', () => {
    const win = { localStorage: { getItem: () => 'http://localhost:30080' } as unknown as Storage };
    expect(readWorldBaseFrom(win)).toBe('http://localhost:30080');
  });

  it('uses the default when the browser blocks storage (reading the property throws)', () => {
    const win = {
      get localStorage(): Storage {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(readWorldBaseFrom(win)).toBe(DEFAULT_WORLD_BASE);
  });
});
