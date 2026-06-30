import { test, expect, APIRequestContext, Page } from '@playwright/test'

const ADMIN = { email: 'admin@example.com', password: 'password123' }
const DEV = { email: 'dev@example.com', password: 'password123' }

async function token(request: APIRequestContext, creds: { email: string; password: string }) {
  const res = await request.post('/api/auth/login', { data: creds })
  return (await res.json()).data.tokens.accessToken as string
}

async function gotoAs(page: Page, t: string, url: string) {
  await page.addInitScript((tok) => localStorage.setItem('accessToken', tok as string), t)
  await page.goto(url)
}

test.describe('Admin panel (RBAC-5)', () => {
  test('admin can change a user\'s role and it persists', async ({ page, request }) => {
    // a fresh target user (DEVELOPER) to promote
    const email = `promote_${Date.now()}@example.com`
    const reg = await request.post('/api/auth/register', {
      data: { name: 'Promote Me', email, password: 'password123' },
    })
    const target = (await reg.json()).data.user

    const adminToken = await token(request, ADMIN)
    await gotoAs(page, adminToken, '/admin')

    await expect(page.getByTestId('admin-users-table')).toBeVisible()
    const patched = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().includes(`/users/${target.id}/role`)
    )
    await page.getByTestId(`role-select-${target.id}`).selectOption('PM')
    await patched

    // verify via API that the role really changed
    const users = await (await request.get('/api/users', { headers: { Authorization: `Bearer ${adminToken}` } })).json()
    const updated = users.data.find((u: { id: string }) => u.id === target.id)
    expect(updated.role).toBe('PM')
  })

  test('a non-admin is denied access to the admin panel', async ({ page, request }) => {
    const devToken = await token(request, DEV)
    await gotoAs(page, devToken, '/admin')

    await expect(page.getByTestId('admin-forbidden')).toBeVisible()
    await expect(page.getByTestId('admin-users-table')).toHaveCount(0)
  })
})
