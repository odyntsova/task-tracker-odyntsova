import { APIRequestContext, Page } from '@playwright/test'
import { Client } from 'pg'

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

export async function gotoAs(page: Page, token: string, url: string) {
  await page.addInitScript((t) => localStorage.setItem('accessToken', t as string), token)
  await page.goto(url)
}

export const uniqueEmail = (p = 'e2e') => `${p}_${Date.now()}_${Math.floor(Math.random() * 1e4)}@example.com`
