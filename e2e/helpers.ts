import { APIRequestContext, Page } from '@playwright/test'
import { Client } from 'pg'
import { createHash, randomBytes } from 'crypto'

// The e2e backend (started by playwright.config webServer) uses this DB.
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://kateryna@localhost:5432/tracker_dev'

const PASSWORD = 'password123'

/**
 * Provisions a verified user the way QA would, minus the mailbox: signs up via
 * the API, marks the email verified directly in the DB (the verification token
 * is delivered by email, which we can't read in e2e), then logs in for a token.
 */
export async function verifiedSession(request: APIRequestContext, email: string) {
  await request.post('/api/auth/signup', { data: { email, password: PASSWORD } })

  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  await client.query('UPDATE "User" SET "emailVerifiedAt" = now() WHERE email = $1', [email])
  await client.end()

  const res = await request.post('/api/auth/login', { data: { email, password: PASSWORD } })
  const { tokens, user } = (await res.json()).data
  return { token: tokens.accessToken as string, user }
}

/**
 * Issues a password-reset token directly in the DB. The raw token is only
 * delivered by email (unreadable in e2e), so we mint one the same way the
 * backend does — sha256(raw) — and return the raw value to type into the UI.
 */
export async function issueResetToken(email: string): Promise<string> {
  const raw = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(raw).digest('hex')
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  const { rows } = await client.query('SELECT id FROM "User" WHERE email = $1', [email])
  await client.query(
    `INSERT INTO "PasswordResetToken" ("id", "tokenHash", "userId", "expiresAt")
     VALUES (gen_random_uuid(), $1, $2, now() + interval '1 hour')`,
    [tokenHash, rows[0].id]
  )
  await client.end()
  return raw
}

export async function gotoAs(page: Page, token: string, url: string) {
  await page.addInitScript((t) => localStorage.setItem('accessToken', t as string), token)
  await page.goto(url)
}

export const uniqueEmail = (p = 'e2e') => `${p}_${Date.now()}_${Math.floor(Math.random() * 1e4)}@example.com`
