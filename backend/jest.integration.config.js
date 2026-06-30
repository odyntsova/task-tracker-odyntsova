/** @type {import('ts-jest').JestConfigWithTsJest} */
// Integration tests run against a REAL SQLite database (no Prisma mocks).
// DATABASE_URL + JWT_SECRET are provided by the `test:integration` npm script.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globalSetup: '<rootDir>/tests/integration/globalSetup.ts',
  // Run serially: tests share one database and clean it between cases.
  maxWorkers: 1,
}
