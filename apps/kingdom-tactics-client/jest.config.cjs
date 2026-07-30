/**
 * Local Jest config for the kingdom-tactics-client package.
 *
 * The repo-root jest.config.cjs collects tests by a `-server`/`-client` path SEGMENT
 * (`<rootDir>/**​/**-client/**​/*.test.tsx`); with `--rootDir .` this package IS the
 * `-client` dir, so no co-located test below it can match. Like the engine and the KT
 * server, this app therefore owns a self-contained config — here a jsdom environment for
 * React Testing Library — which also lets it be tested in isolation and resolve the engine
 * to its TS source (no prior build needed).
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'kingdom-tactics-client',

  // WebCrypto + a minimal IndexedDB, both absent from jsdom and both needed by device
  // credentials (features/auth/deviceCredentials.ts). Same file as mud-builder-client's.
  setupFiles: ['<rootDir>/jest.setup.cjs'],

  // jsdom defaults to http://localhost/, which it reports as a NON-secure context — so device
  // credentials would correctly refuse to initialise and the tests would exercise the wrong
  // branch. Point it at an https origin on the real hostname instead, which is how this app
  // actually runs everywhere (edge nginx over TLS, dev included).
  testEnvironmentOptions: { url: 'https://kingdom-tactics.shatteredarchive.dev/' },
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  rootDir: '.',

  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.jest.json',
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },

  moduleNameMapper: {
    // Resolve the engine to its TS source so tests don't require a prior build.
    '^@shatteredarchive/kingdom-tactics-engine$':
      '<rootDir>/../../services/kingdom-tactics-engine/src/index.ts',
    '^@shatteredarchive/sdk-client$': '<rootDir>/../../sdks/sdks-client/src/index.ts',
    // kt-config reads Vite's `import.meta.env`, which jest (CJS) cannot parse — use a static stub.
    '^\\./kt-config$': '<rootDir>/src/features/net/kt-config.stub.ts',
    // Same problem, Phase F's auth/site-API config.
    '^\\./kt-auth-config$': '<rootDir>/src/features/auth/kt-auth-config.stub.ts',
    // Stub CSS/asset imports (Vite handles them at build; jsdom cannot parse them).
    '\\.(css|scss|sass)$': '<rootDir>/jest.style-stub.cjs',
    // NodeNext ESM specifiers in engine source use `.js`; strip for ts-jest resolution.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
