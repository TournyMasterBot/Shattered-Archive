/**
 * Local Jest config for the kingdom-tactics-engine package.
 *
 * The repo-root jest.config.cjs only collects tests whose path contains a
 * `-server`/`-client` segment; this package is `kingdom-tactics-engine` (an
 * isomorphic domain package), so it owns a self-contained node-environment config.
 * This also makes the engine testable in isolation.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'kingdom-tactics-engine',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '.',

  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],

  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },

  moduleNameMapper: {
    // Resolve workspace deps to their TS sources so tests don't require a prior build.
    '^@shatteredarchive/types-global$': '<rootDir>/../../types/types-global/src/index.ts',
    '^@shatteredarchive/utils-global$': '<rootDir>/../../utils/utils-global/src/index.ts',
    // NodeNext ESM imports use `.js` specifiers; strip for ts-jest resolution.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
