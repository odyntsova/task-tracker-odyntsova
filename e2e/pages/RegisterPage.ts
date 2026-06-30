import { Page, Locator, expect } from '@playwright/test'

export class RegisterPage {
  readonly page: Page
  readonly name: Locator
  readonly email: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly error: Locator
  readonly loginLink: Locator

  constructor(page: Page) {
    this.page = page
    this.name = page.getByTestId('name-input')
    this.email = page.getByTestId('email-input')
    this.password = page.getByTestId('password-input')
    this.submit = page.getByTestId('register-submit')
    this.error = page.getByTestId('register-error')
    this.loginLink = page.getByRole('link', { name: 'Sign in' })
  }

  async goto() {
    await this.page.goto('/register')
    await expect(this.page.getByTestId('register-page')).toBeVisible()
  }

  async register(name: string, email: string, password: string) {
    await this.name.fill(name)
    await this.email.fill(email)
    await this.password.fill(password)
    await this.submit.click()
  }
}
