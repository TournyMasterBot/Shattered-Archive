/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // When each workspace runs with --rootDir .,
  // this will point at its own src folder.
  roots: ['<rootDir>/src'],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1", // map ./foo.js -> ./foo (so ts-jest can pick up foo.ts)
  },
  testMatch: [
    '**/__tests__/**/*.(test|spec).[tj]s?(x)',
    '**/?(*.)+(test|spec).[tj]s?(x)',
  ],
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
};
