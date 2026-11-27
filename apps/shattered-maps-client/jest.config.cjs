/**
 * Local Jest config for the shattered-maps-client package.
 *
 * The repo-root jest.config.cjs collects tests by a `-server`/`-client` path SEGMENT; with `--rootDir .` this package IS the `-client`
 * dir, so no co-located test below it can match. Like scrum-poker-client it owns a self-contained jsdom config. The Mapper's pure code
 * (coords, hex and octagon geometry, direction maths, ASCII and SVG export, persistence) is what is tested here.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'shattered-maps-client',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  rootDir: '.',
  setupFiles: ['<rootDir>/jest.setup.cjs'],

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
    // Stub stylesheet imports (Vite handles them at build; jsdom cannot parse them).
    '\\.(css|scss|sass)$': '<rootDir>/jest.style-stub.cjs',
    '^@shatteredarchive/shattered-maps-core$': '<rootDir>/../../services/shattered-maps-core/src/index.ts',
    '^@shatteredarchive/merc-area$': '<rootDir>/../../services/merc-area/src/index.ts',
    // the core's sources import each other with a .js suffix (ESM): point those at the .ts files
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@state/(.*)$': '<rootDir>/src/state/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
