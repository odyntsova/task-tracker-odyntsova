import { execSync } from 'child_process'

// Pushes the Prisma schema to the test database before the integration suite
// runs. DATABASE_URL is set by the `test:integration` npm script and points at
// a throwaway SQLite file (test-integration.db), separate from dev.db.
export default function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set for integration tests')
  }

  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: process.env,
  })
}
