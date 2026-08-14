/**
 * Local Jest config for scrum-poker-core.
 *
 * The repo-root config collects tests by a `-server`/`-client` path segment; this
 * package is neither, so it owns a self-contained node-environment config (same
 * arrangement as services/merc-area).
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'scrum-poker-core',
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
      {
        useESM: true,
        tsconfig: '<rootDir>/../../tsconfig.jest.server.json',
        // The shared server jest tsconfig omits isolatedModules; ts-jest's per-file
        // NodeNext transpile only warns (TS151002) and still runs — silence the noise.
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },

  moduleNameMapper: {
    // NodeNext ESM imports use `.js` specifiers; strip for ts-jest resolution.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
