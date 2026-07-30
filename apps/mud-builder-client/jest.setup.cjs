/**
 * jsdom does not implement WebCrypto, but device credentials (sdk-client's DeviceCredentials,
 * reached via api/client.ts) need `crypto.subtle` to generate the device keypair.
 *
 * Worth being clear about what this does and does not simulate: real browsers expose
 * `crypto.subtle` only in a SECURE CONTEXT (https, or the localhost/127.0.0.1 names
 * specifically). In this stack that condition is always met — every service is reached by
 * hostname through the nginx router over https, dev included — so this polyfill stands in for
 * the NORMAL case, not an exotic one. api/client.ts still fails soft for off-path access, and
 * AccessPage has tests for that branch.
 *
 * Assign-only-if-missing so a future jsdom that ships WebCrypto wins instead of being clobbered.
 */
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');

/**
 * jsdom ships neither, and sdk-client uses TextEncoder inline when building the bytes to sign.
 * Enrolment alone never reaches it, so this only matters once a test mints a token — added
 * pre-emptively so that path doesn't fail confusingly later.
 */
if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder;
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder;

if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
}

/**
 * Minimal IndexedDB shim — jsdom has none, and api/client.ts (correctly) refuses to offer
 * device credentials without it, so without this the enrolled UI path could never be tested.
 *
 * Covers exactly the surface sdk-client's storage adapter uses: open with an upgrade that
 * creates one object store, then get/put/delete by a single key inside a transaction. It is
 * NOT a general IndexedDB implementation and shouldn't be treated as one; values are held by
 * reference in a Map, which conveniently means a non-extractable CryptoKey survives storage
 * exactly as it does in a real browser (structured clone preserves it).
 *
 * Callbacks fire on a microtask because the real API is asynchronous and code under test
 * legitimately attaches its onsuccess handler after the call returns.
 */
if (typeof globalThis.indexedDB === 'undefined') {
  const databases = new Map();

  const fireAsync = (request, resultFn) => {
    Promise.resolve().then(() => {
      try {
        request.result = resultFn();
        request.onsuccess?.({ target: request });
      } catch (err) {
        request.error = err;
        request.onerror?.({ target: request });
      }
    });
  };

  const makeStore = (map) => ({
    get: (key) => {
      const request = {};
      fireAsync(request, () => map.get(key));
      return request;
    },
    put: (value, key) => {
      const request = {};
      fireAsync(request, () => {
        map.set(key, value);
        return key;
      });
      return request;
    },
    delete: (key) => {
      const request = {};
      fireAsync(request, () => {
        map.delete(key);
        return undefined;
      });
      return request;
    },
  });

  globalThis.indexedDB = {
    open(name) {
      if (!databases.has(name)) databases.set(name, new Map());
      const stores = databases.get(name);

      const db = {
        objectStoreNames: {
          contains: (storeName) => stores.has(storeName),
        },
        createObjectStore: (storeName) => {
          if (!stores.has(storeName)) stores.set(storeName, new Map());
          return makeStore(stores.get(storeName));
        },
        transaction: (storeName) => ({
          objectStore: () => {
            if (!stores.has(storeName)) stores.set(storeName, new Map());
            return makeStore(stores.get(storeName));
          },
        }),
        close: () => {},
      };

      const request = { result: db };
      Promise.resolve().then(() => {
        // Upgrade only on first open, mirroring a version bump from nothing to 1.
        if (stores.size === 0) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    },
  };

  /**
   * The shim's store is per-FILE, so a device enrolled in one test stays enrolled in the next
   * and ordering decides the result. Any suite that enrols must call this in beforeEach.
   * Mirrors kingdom-tactics-client/jest.setup.cjs, where the same trap was found first.
   */
  globalThis.__resetIndexedDbShim = () => databases.clear();
}
