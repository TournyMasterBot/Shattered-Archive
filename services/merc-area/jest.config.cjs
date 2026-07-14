/**
 * Local Jest config for the merc-area package.
 *
 * The repo-root jest.config.cjs only collects tests whose path contains a
 * `-server`/`-client` segment; this package is `merc-area` (a pure format
 * library), so it owns a self-contained node-environment config, exactly like
 * kingdom-tactics-engine. This also makes the library testable in isolation.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'merc-area',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '.',

  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],

  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { useESM: true, tsconfig: '<rootDir>/tsconfig.jest.json', diagnostics: { ignoreCodes: [151002] } },
    ],
  },

  moduleNameMapper: {
    // NodeNext ESM imports use `.js` specifiers; strip for ts-jest resolution.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
