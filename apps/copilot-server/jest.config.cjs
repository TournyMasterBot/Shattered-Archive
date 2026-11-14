/**
 * Local Jest config for the copilot-server package.
 *
 * The repo-root jest.config.cjs collects tests by a `-server`/`-client` path SEGMENT; with `--rootDir .` this package IS the
 * `-server` dir, so no co-located test below it can match. Like simulacrum-server it owns a self-contained node-environment config
 * and resolves the workspace dependency to its TS source (no prior build needed).
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'copilot-server',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '.',

  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],

  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/testing/'],

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/../../tsconfig.jest.server.json',
        // The shared server jest tsconfig omits isolatedModules; ts-jest's per-file NodeNext transpile only warns (TS151002).
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },

  moduleNameMapper: {
    '^@shatteredarchive/copilot-core$': '<rootDir>/../../services/copilot-core/src/index.ts',
    '^@shatteredarchive/shattered-maps-core$': '<rootDir>/../../services/shattered-maps-core/src/index.ts',
    '^@shatteredarchive/merc-area$': '<rootDir>/../../services/merc-area/src/index.ts',
    // NodeNext ESM imports use `.js` specifiers; strip for ts-jest resolution.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
