/** @type {import('jest').Config} */
module.exports = {
  projects: [
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

      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],
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
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },

      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],
    },
  ],
};
