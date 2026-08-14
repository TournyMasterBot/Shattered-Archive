/**
 * Local Jest config for the scrum-poker-client package.
 *
 * The repo-root jest.config.cjs collects tests by a `-server`/`-client` path SEGMENT
 * (`<rootDir>/**​/**-client/**​/*.test.tsx`); with `--rootDir .` this package IS the
 * `-client` dir, so no co-located test below it can match. Like mud-builder-client, it
 * therefore owns a self-contained jsdom config for React Testing Library and resolves
 * workspace deps to their TS sources (no prior build needed).
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'scrum-poker-client',
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
    // Resolve workspace deps to their TS sources so tests don't require a prior build.
    '^@shatteredarchive/scrum-poker-core$': '<rootDir>/../../services/scrum-poker-core/src/index.ts',
    // Stub CSS/asset imports (Vite handles them at build; jsdom cannot parse them).
    '\\.(css|scss|sass)$': '<rootDir>/jest.style-stub.cjs',
    // NodeNext ESM specifiers use `.js`; strip for ts-jest resolution.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
