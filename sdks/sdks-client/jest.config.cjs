/**
 * Local Jest config for the sdk-client package.
 *
 * NODE environment, deliberately, even though this is a `-client` package — which is also
 * why it cannot use the root config's generic `client` project (that one is jsdom).
 * device-credentials.ts touches no DOM: it uses TextEncoder, btoa, fetch/Response/Headers
 * and WebCrypto, all of which Node provides NATIVELY while jsdom provides none of them.
 * Running under Node therefore tests the real implementations rather than a stack of
 * polyfills — a strictly better signal for crypto and fetch behaviour. (IndexedDB and
 * WebCrypto are injectable in the module anyway; that seam is also what will make the SDK
 * usable from React Native, which ships neither.)
 *
 * Registered in the root config's LOCAL_CONFIG_PACKAGES *and* LOCAL_CONFIG_IGNORES, so the
 * generic client project skips this path and no suite runs twice.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'sdk-client',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '.',

  setupFiles: ['<rootDir>/jest.setup.cjs'],

  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],

  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.jest.json',
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },

  moduleNameMapper: {
    // NodeNext ESM specifiers use `.js`; strip for ts-jest resolution.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
