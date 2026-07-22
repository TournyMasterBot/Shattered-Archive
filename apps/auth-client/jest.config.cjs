/**
 * Local Jest config for the auth-client package.
 *
 * The repo-root jest.config.cjs collects tests by a `-server`/`-client` path SEGMENT
 * (`<rootDir>/**​/**-client/**​/*.test.tsx`); with `--rootDir .` this package IS the
 * `-client` dir, so no co-located test below it can match. Like mud-builder-client,
 * this app therefore owns a self-contained jsdom config for React Testing Library.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  displayName: 'auth-client',
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
    // Stub CSS/asset imports (Vite handles them at build; jsdom cannot parse them).
    '\\.(css|scss|sass)$': '<rootDir>/jest.style-stub.cjs',
    // NodeNext ESM specifiers use `.js`; strip for ts-jest resolution.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
