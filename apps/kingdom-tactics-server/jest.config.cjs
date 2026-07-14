/**
 * Local Jest config for the kingdom-tactics-server package.
 *
 * The repo-root jest.config.cjs collects tests by a `-server`/`-client` path SEGMENT
 * (`<rootDir>/**​/**-server/**​/*.test.ts`); with `--rootDir .` this package IS the
 * `-server` dir, so no co-located test below it can match. Like the engine, this app
 * therefore owns a self-contained node-environment config, which also lets it be tested
 * in isolation and resolve workspace deps to their TS sources (no prior build needed).
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'kingdom-tactics-server',
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
        // The shared server jest tsconfig omits isolatedModules; ts-jest's per-file NodeNext
        // transpile only warns (TS151002) and still runs — silence the noise.
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },

  moduleNameMapper: {
    // Resolve workspace deps to their TS sources so tests don't require a prior build.
    '^@shatteredarchive/kingdom-tactics-engine$': '<rootDir>/../../services/kingdom-tactics-engine/src/index.ts',
    '^@shatteredarchive/types-global$': '<rootDir>/../../types/types-global/src/index.ts',
    '^@shatteredarchive/utils-global$': '<rootDir>/../../utils/utils-global/src/index.ts',
    // NodeNext ESM imports use `.js` specifiers; strip for ts-jest resolution.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
