import { test, expect, APIRequestContext, Page } from '@playwright/test'

const PM = { email: 'pm@example.com', password: 'password123' }

async function token(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: PM })
  return (await res.json()).data.tokens.accessToken as string
}

async function gotoAs(page: Page, t: string, url: string) {
  await page.addInitScript((tok) => localStorage.setItem('accessToken', tok as string), t)
  await page.goto(url)
}

test.describe('Task activity log (TASK-7)', () => {
  test('status change is recorded and shown on the task detail page', async ({ page, request }) => {
    const t = await token(request)
    const headers = { Authorization: `Bearer ${t}` }
    const project = (await (await request.post('/api/projects', { headers, data: { name: `Act ${Date.now()}` } })).json()).data
    const task = (await (await request.post(`/api/projects/${project.id}/tasks`, { headers, data: { title: 'Track me' } })).json()).data

    // change status via API (TODO → IN_PROGRESS) → records activity
    await request.patch(`/api/tasks/${task.id}`, { headers, data: { status: 'IN_PROGRESS' } })

    await gotoAs(page, t, `/projects/${project.id}/tasks/${task.id}`)

    await expect(page.getByTestId('activity-list')).toBeVisible()
    await expect(page.getByTestId('activity-list')).toContainText('status')
    await expect(page.getByTestId('activity-list')).toContainText('IN_PROGRESS')
  })
})
