import { API_BASE_STORAGE_KEY, DEV_API_BASE, isAllowedApiBase, resolveApiBase } from './config';

describe('isAllowedApiBase', () => {
  it.each([
    'https://copilot.shatteredarchive.dev',
    'http://shatteredarchive.dev',
    'https://anything.shatteredarchive.dev:8443',
    'http://localhost:65100',
    'http://127.0.0.1:65100',
    'http://192.168.1.81',
    'https://10.0.0.5:8443',
    'http://172.20.1.1',
  ])('accepts %s', (base) => expect(isAllowedApiBase(base)).toBe(true));

  it.each([
    'https://example.com',
    'https://shatteredarchive.com',
    'https://evilshatteredarchive.dev',
    'http://8.8.8.8',
    'http://172.32.0.1',
    'https://copilot.shatteredarchive.dev/',
    'https://copilot.shatteredarchive.dev/path',
    'https://user:pw@copilot.shatteredarchive.dev',
    'ftp://localhost',
    'copilot.shatteredarchive.dev',
    '',
  ])('refuses %j', (base) => expect(isAllowedApiBase(base)).toBe(false));
});

describe('resolveApiBase', () => {
  it('is the dev vhost when there is no override', () => {
    expect(resolveApiBase(undefined)).toBe(DEV_API_BASE);
    expect(resolveApiBase({ getItem: () => null })).toBe(DEV_API_BASE);
  });

  it('uses an allowed override from storage, and ignores one that is not allowed', () => {
    const read = (value: string) => ({ getItem: (key: string) => (key === API_BASE_STORAGE_KEY ? value : null) });
    expect(resolveApiBase(read('http://192.168.1.81:8080'))).toBe('http://192.168.1.81:8080');
    expect(resolveApiBase(read('https://evil.example'))).toBe(DEV_API_BASE);
  });

  it('is the dev vhost when storage throws', () => {
    expect(
      resolveApiBase({
        getItem: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      }),
    ).toBe(DEV_API_BASE);
  });
});
