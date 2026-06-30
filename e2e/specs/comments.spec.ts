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

test.describe('Task comments (TASK-6)', () => {
  test('open a task and add a comment', async ({ page, request }) => {
    const t = await token(request)
    const headers = { Authorization: `Bearer ${t}` }
    const project = (await (await request.post('/api/projects', { headers, data: { name: `C ${Date.now()}` } })).json()).data
    const task = (await (await request.post(`/api/projects/${project.id}/tasks`, { headers, data: { title: 'Discuss me' } })).json()).data

    await gotoAs(page, t, `/projects/${project.id}/tasks/${task.id}`)

    await expect(page.getByTestId('task-detail-title')).toHaveText('Discuss me')
    await expect(page.getByTestId('comments-empty')).toBeVisible()

    await page.getByTestId('comment-input').fill('Looks good to me')
    await page.getByTestId('comment-submit').click()

    await expect(page.getByTestId('comments-list')).toContainText('Looks good to me')
    // persists across reload
    await page.reload()
    await expect(page.getByTestId('comments-list')).toContainText('Looks good to me')
  })
})
