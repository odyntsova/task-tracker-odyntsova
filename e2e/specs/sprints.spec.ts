import { test, expect, APIRequestContext, Page } from '@playwright/test'

const PM = { email: 'pm@example.com', password: 'password123' }
const DEV = { email: 'dev@example.com', password: 'password123' }

async function tokenFor(request: APIRequestContext, creds: { email: string; password: string }) {
  const res = await request.post('/api/auth/login', { data: creds })
  return (await res.json()).data.tokens.accessToken as string
}

async function createProject(request: APIRequestContext, token: string) {
  const res = await request.post('/api/projects', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `Sprint UI ${Date.now()}` },
  })
  return (await res.json()).data.id as string
}

async function gotoAs(page: Page, token: string, url: string) {
  await page.addInitScript((t) => localStorage.setItem('accessToken', t as string), token)
  await page.goto(url)
}

test.describe('Sprints page (FE sprints)', () => {
  test('PM can create a sprint and see it in the list', async ({ page, request }) => {
    const token = await tokenFor(request, PM)
    const projectId = await createProject(request, token)
    await gotoAs(page, token, `/projects/${projectId}/sprints`)

    await page.getByTestId('sprint-name').fill('Sprint Alpha')
    await page.getByTestId('sprint-start').fill('2026-07-01')
    await page.getByTestId('sprint-end').fill('2026-07-14')
    await page.getByTestId('create-sprint-submit').click()

    await expect(page.getByTestId('sprints-list').locator('li', { hasText: 'Sprint Alpha' })).toBeVisible()
  })

  test('invalid dates (end before start) surface an error', async ({ page, request }) => {
    const token = await tokenFor(request, PM)
    const projectId = await createProject(request, token)
    await gotoAs(page, token, `/projects/${projectId}/sprints`)

    await page.getByTestId('sprint-name').fill('Bad Sprint')
    await page.getByTestId('sprint-start').fill('2026-07-14')
    await page.getByTestId('sprint-end').fill('2026-07-01')
    await page.getByTestId('create-sprint-submit').click()

    await expect(page.getByTestId('create-sprint-error')).toBeVisible()
  })

  test('a DEVELOPER does not see the create-sprint form', async ({ page, request }) => {
    const pmToken = await tokenFor(request, PM)
    const projectId = await createProject(request, pmToken) // PM owns project creation
    const devToken = await tokenFor(request, DEV)
    await gotoAs(page, devToken, `/projects/${projectId}/sprints`)

    await expect(page.getByTestId('sprints-page')).toBeVisible()
    await expect(page.getByTestId('create-sprint-form')).toHaveCount(0)
  })

  test('a task can be assigned to a sprint from the tasks page', async ({ page, request }) => {
    const token = await tokenFor(request, PM)
    const projectId = await createProject(request, token)
    const headers = { Authorization: `Bearer ${token}` }
    // a sprint + a task via API
    await request.post(`/api/projects/${projectId}/sprints`, {
      headers,
      data: { name: 'Sprint One', startDate: '2026-07-01', endDate: '2026-07-14' },
    })
    await request.post(`/api/projects/${projectId}/tasks`, {
      headers,
      data: { title: 'Sprintable task', priority: 'MEDIUM' },
    })

    await gotoAs(page, token, `/projects/${projectId}/tasks`)

    const row = page.getByTestId('tasks-list').locator('li', { hasText: 'Sprintable task' })
    // selects order in a row: status, priority, assignee, sprint
    await row.locator('select').nth(3).selectOption({ label: 'Sprint One' })

    await page.reload()
    await expect(
      page.getByTestId('tasks-list').locator('li', { hasText: 'Sprintable task' }).locator('select').nth(3)
    ).toHaveValue(/.+/) // a sprint is now selected
  })
})
