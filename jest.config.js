module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  coverageDirectory: "./coverage",
  collectCoverage: true,
  collectCoverageFrom: ["src/**/*.ts"],
  coverageReporters: ["lcov", "text", "html"],
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
    "^@shared/(.*)$": "<rootDir>/src/shared/$1",
    "^@web-server/(.*)$": "<rootDir>/src/web-server/$1",
    "^@web-client/(.*)$": "<rootDir>/src/web-client/$1",
    "^@game-server/(.*)$": "<rootDir>/src/game-server/$1",
    "^@game-client/(.*)$": "<rootDir>/src/game-client/$1",
  },
  modulePaths: ["<rootDir>/src"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  testTimeout: 30000, // Optional: Increase timeout if needed
};
