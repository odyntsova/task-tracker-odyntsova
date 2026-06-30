import { test, expect } from '@playwright/test'
import { verifiedSession, issueResetToken, uniqueEmail } from '../helpers'

test.describe('Password reset (UI)', () => {
  test('forgot-password screen confirms without revealing account state', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByTestId('email-input').fill('whoever@example.com')
    await page.getByTestId('forgot-submit').click()
    await expect(page.getByTestId('forgot-sent')).toBeVisible()
  })

  test('reset with a valid token sets a new password; old password stops working', async ({ page, request }) => {
    const email = uniqueEmail('reset')
    await verifiedSession(request, email) // signs up with the default password
    const token = await issueResetToken(email)

    await page.goto(`/reset-password?token=${token}`)
    await expect(page.getByTestId('reset-token-input')).toHaveValue(token)
    await page.getByTestId('reset-password-input').fill('brandnew123')
    await page.getByTestId('reset-submit').click()

    await expect(page.getByTestId('reset-ok')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/, { timeout: 5000 })

    // the new password works, the old one no longer does
    const ok = await request.post('/api/auth/login', { data: { email, password: 'brandnew123' } })
    expect(ok.status()).toBe(200)
    const old = await request.post('/api/auth/login', { data: { email, password: 'password123' } })
    expect(old.status()).toBe(401)
  })

  test('reset with an invalid token shows an error', async ({ page }) => {
    await page.goto('/reset-password')
    await page.getByTestId('reset-token-input').fill('not-a-real-token')
    await page.getByTestId('reset-password-input').fill('whatever123')
    await page.getByTestId('reset-submit').click()
    await expect(page.getByTestId('reset-error')).toBeVisible()
  })
})
