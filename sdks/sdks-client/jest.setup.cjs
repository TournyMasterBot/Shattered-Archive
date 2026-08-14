/**
 * Runs under the NODE test environment (see jest.config.cjs for why), so TextEncoder,
 * btoa, fetch/Response/Headers and WebCrypto are all real and need no polyfill.
 *
 * What Node does NOT have is web storage — and this package has a load-bearing regression
 * test asserting that device-credentials.ts never writes a credential to localStorage or
 * sessionStorage. So install a TRAP rather than a polyfill: a storage object that records
 * writes and is never expected to receive any. If a future refactor starts persisting a
 * token, that test fails loudly instead of silently passing because the global was absent.
 */
function makeStorageTrap() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

globalThis.localStorage = makeStorageTrap();
globalThis.sessionStorage = makeStorageTrap();
