import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'

// Seeded users (see backend/prisma/seed.ts)
const QA = { email: 'qa@example.com', password: 'password123' }

// Unique email per run so registration tests don't collide with prior runs.
const uniqueEmail = () => `e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`

test.describe('Login (TC-010..TC-013)', () => {
  test('TC-010: logs in with valid credentials and lands on the dashboard', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.login(QA.email, QA.password)

    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeTruthy()
  })

  test('TC-011: email is case-insensitive', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.login('QA@Example.com', QA.password)

    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  })

  test('TC-012: wrong password shows an error and stays on /login', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.login(QA.email, 'wrong-password')

    await expect(login.error).toBeVisible()
    await expect(login.error).toHaveText('Invalid email or password')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('Registration (TC-001, TC-031)', () => {
  test('TC-001: registers a new user and lands on the dashboard', async ({ page }) => {
    const register = new RegisterPage(page)
    await register.goto()
    await register.register('E2E User', uniqueEmail(), 'password123')

    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeTruthy()
  })

  test('TC-031: registering with an existing email shows a 409 message', async ({ page }) => {
    const register = new RegisterPage(page)
    await register.goto()
    // qa@example.com is seeded → duplicate
    await register.register('Dup User', QA.email, 'password123')

    await expect(register.error).toBeVisible()
    await expect(register.error).toHaveText('This email is already registered')
    await expect(page).toHaveURL(/\/register$/)
  })
})

test.describe('Navigation & guards (TC-030, TC-032)', () => {
  test('TC-030: can navigate between login and register', async ({ page }) => {
    const login = new LoginPage(page)
    await login.goto()

    await login.registerLink.click()
    await expect(page.getByTestId('register-page')).toBeVisible()

    await new RegisterPage(page).loginLink.click()
    await expect(page.getByTestId('login-page')).toBeVisible()
  })

  test('TC-032: visiting a protected route without a token redirects to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('login-page')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })
})
