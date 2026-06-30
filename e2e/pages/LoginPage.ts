import { Page, Locator, expect } from '@playwright/test'

export class LoginPage {
  readonly page: Page
  readonly email: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly error: Locator
  readonly registerLink: Locator

  constructor(page: Page) {
    this.page = page
    this.email = page.getByTestId('email-input')
    this.password = page.getByTestId('password-input')
    this.submit = page.getByTestId('login-submit')
    this.error = page.getByTestId('login-error')
    this.registerLink = page.getByRole('link', { name: 'Create one' })
  }

  async goto() {
    await this.page.goto('/login')
    await expect(this.page.getByTestId('login-page')).toBeVisible()
  }

  async login(email: string, password: string) {
    await this.email.fill(email)
    await this.password.fill(password)
    await this.submit.click()
  }
}
