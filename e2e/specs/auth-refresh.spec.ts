import { test, expect, APIRequestContext, Page } from '@playwright/test'

const PM = { email: 'pm@example.com', password: 'password123' }

async function realTokens(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: PM })
  return (await res.json()).data.tokens as { accessToken: string; refreshToken: string }
}

async function seedStorage(page: Page, accessToken: string, refreshToken: string) {
  await page.addInitScript(
    ([a, r]) => {
      localStorage.setItem('accessToken', a as string)
      localStorage.setItem('refreshToken', r as string)
    },
    [accessToken, refreshToken]
  )
}

test.describe('Client-side token refresh (AUTH-3 FE)', () => {
  test('transparently refreshes an expired access token and loads the page', async ({ page, request }) => {
    const { refreshToken } = await realTokens(request)
    // bogus access token (backend will 401) + a VALID refresh token
    await seedStorage(page, 'bad.access.token', refreshToken)

    await page.goto('/')

    // dashboard loaded via a silent refresh — no redirect to /login
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    // the access token in storage was replaced with a fresh one
    const stored = await page.evaluate(() => localStorage.getItem('accessToken'))
    expect(stored).not.toBe('bad.access.token')
  })

  test('redirects to /login when the refresh token is also invalid', async ({ page }) => {
    await seedStorage(page, 'bad.access.token', 'bad.refresh.token')

    await page.goto('/')

    await expect(page.getByTestId('login-page')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('logout revokes the refresh token (subsequent refresh fails)', async ({ page, request }) => {
    const { accessToken, refreshToken } = await realTokens(request)
    await seedStorage(page, accessToken, refreshToken)

    await page.goto('/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await page.getByTestId('logout-button').click()
    await expect(page.getByTestId('login-page')).toBeVisible()

    // the refresh token used at logout must now be rejected by the API
    const res = await request.post('/api/auth/refresh', { data: { refreshToken } })
    expect(res.status()).toBe(401)
  })
})
