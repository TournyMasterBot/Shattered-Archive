/**
 * Repo-root Jest config.
 *
 * Packages listed by PATH own a self-contained local jest.config.cjs (they need
 * settings the generic projects below don't have: workspace deps resolved to TS
 * sources, CSS/asset stubs for jsdom, kt-config stubs). Keep new settings in the
 * package config, not here — the root only aggregates.
 *
 * The generic `server`/`client` projects collect the remaining packages by their
 * `-server`/`-client` path segment; the path-listed packages are excluded from
 * them via testPathIgnorePatterns so no suite runs twice.
 *
 * @type {import('jest').Config}
 */

// Packages with their own jest.config.cjs — excluded from the generic projects.
const LOCAL_CONFIG_PACKAGES = [
  '<rootDir>/apps/auth-client',
  '<rootDir>/apps/auth-server',
  '<rootDir>/apps/kingdom-tactics-client',
  '<rootDir>/apps/kingdom-tactics-server',
  '<rootDir>/apps/mud-builder-client',
  '<rootDir>/apps/mud-builder-server',
  '<rootDir>/apps/scrum-poker-client',
  '<rootDir>/apps/scrum-poker-server',
  '<rootDir>/apps/soulsteel-client',
  '<rootDir>/apps/soulsteel-server',
  '<rootDir>/sdks/sdks-client',
  '<rootDir>/services/kingdom-tactics-engine',
  '<rootDir>/services/merc-area',
  '<rootDir>/services/scrum-poker-core',
];

const LOCAL_CONFIG_IGNORES = [
  '/apps/auth-client/',
  '/apps/auth-server/',
  '/apps/kingdom-tactics-client/',
  '/apps/kingdom-tactics-server/',
  '/apps/mud-builder-client/',
  '/apps/mud-builder-server/',
  '/apps/scrum-poker-client/',
  '/apps/scrum-poker-server/',
  '/apps/soulsteel-client/',
  '/apps/soulsteel-server/',
  '/sdks/sdks-client/',
  '/services/kingdom-tactics-engine/',
  '/services/merc-area/',
  '/services/scrum-poker-core/',
];

module.exports = {
  projects: [
    ...LOCAL_CONFIG_PACKAGES,

    // -------------------------
    // SERVER TESTS (Node)
    // -------------------------
    {
      displayName: 'server',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',

      testMatch: [
        '<rootDir>/**/**-server/**/*.test.ts',
        '<rootDir>/**/**-server/**/*.spec.ts',
        '<rootDir>/**/**-server/**/__tests__/**/*.test.ts',
        '<rootDir>/**/**-server/**/__tests__/**/*.spec.ts',
      ],

      extensionsToTreatAsEsm: ['.ts'],

      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.jest.server.json',
          },
        ],
      },

      moduleFileExtensions: ['ts', 'js', 'json', 'node'],

      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },

      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', ...LOCAL_CONFIG_IGNORES],
      coverageDirectory: '<rootDir>/coverage/server',
      coverageReporters: ['json-summary'],
    },

    // -------------------------
    // CLIENT TESTS (jsdom)
    // -------------------------
    {
      displayName: 'client',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'jsdom',

      testMatch: [
        '<rootDir>/**/**-client/**/*.test.ts',
        '<rootDir>/**/**-client/**/*.test.tsx',
        '<rootDir>/**/**-client/**/*.spec.ts',
        '<rootDir>/**/**-client/**/*.spec.tsx',
        '<rootDir>/**/**-client/**/__tests__/**/*.test.ts',
        '<rootDir>/**/**-client/**/__tests__/**/*.test.tsx',
        '<rootDir>/**/**-client/**/__tests__/**/*.spec.ts',
        '<rootDir>/**/**-client/**/__tests__/**/*.spec.tsx',
      ],

      extensionsToTreatAsEsm: ['.ts', '.tsx'],

      transform: {
        '^.+\\.(ts|tsx)$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: '<rootDir>/tsconfig.jest.client.json',
          },
        ],
      },

      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

      moduleNameMapper: {
        '^@shatteredarchive/types-client$': '<rootDir>/types/types-client/src/index.ts',
        '^@shatteredarchive/types-global$': '<rootDir>/types/types-global/src/index.ts',
        '^@shatteredarchive/utils-client/(.+)$': '<rootDir>/utils/utils-client/src/$1.ts',
        '^@shatteredarchive/utils-client$': '<rootDir>/utils/utils-client/src/index.ts',
        '^@shatteredarchive/utils-global$': '<rootDir>/utils/utils-global/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },

      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', ...LOCAL_CONFIG_IGNORES],
      coverageDirectory: '<rootDir>/coverage/client',
      coverageReporters: ['json-summary'],
    },
  ],
};
