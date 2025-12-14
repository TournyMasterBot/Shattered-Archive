/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  roots: ['<rootDir>/src'],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  testMatch: [
    '**/__tests__/**/*.(test|spec).[tj]s?(x)',
    '**/?(*.)+(test|spec).[tj]s?(x)',
  ],

  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },

  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'json-summary',
    'json',
    'lcov',
    'text',
  ],
};
