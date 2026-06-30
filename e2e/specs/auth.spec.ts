import { test, expect } from '@playwright/test'
import { uniqueEmail } from '../helpers'

test.describe('Auth UI', () => {
  test('sign up shows the check-email screen (no auto-login)', async ({ page }) => {
    await page.goto('/signup')
    await page.getByTestId('email-input').fill(uniqueEmail())
    await page.getByTestId('password-input').fill('password123')
    await page.getByTestId('signup-submit').click()
    await expect(page.getByTestId('signup-done')).toBeVisible()
  })

  test('login with wrong credentials shows an error', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('email-input').fill('nobody@example.com')
    await page.getByTestId('password-input').fill('wrongpass1')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('login-error')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('resend-verification screen confirms without revealing account state', async ({ page }) => {
    await page.goto('/verify-needed')
    await page.getByTestId('email-input').fill('whoever@example.com')
    await page.getByTestId('resend-submit').click()
    await expect(page.getByTestId('resend-sent')).toBeVisible()
  })

  test('verify-email with an invalid token shows an error', async ({ page }) => {
    await page.goto('/verify-email')
    await page.getByTestId('token-input').fill('not-a-real-token')
    await page.getByTestId('verify-submit').click()
    await expect(page.getByTestId('verify-fail')).toBeVisible()
  })

  test('an unverified user cannot reach the board (redirected to verify)', async ({ page, request }) => {
    const email = uniqueEmail('unverified')
    await request.post('/api/auth/signup', { data: { email, password: 'password123' } })
    const login = await request.post('/api/auth/login', { data: { email, password: 'password123' } })
    const token = (await login.json()).data.tokens.accessToken

    await page.addInitScript((t) => localStorage.setItem('accessToken', t as string), token)
    await page.goto('/board')
    await expect(page.getByTestId('verify-needed-page')).toBeVisible()
  })
})
