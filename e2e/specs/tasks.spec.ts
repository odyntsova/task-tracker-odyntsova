import { test, expect, APIRequestContext, Page } from '@playwright/test'

const PM = { email: 'pm@example.com', password: 'password123' }
const ASSIGNEE_LABEL = 'Kateryna (QA)' // seeded QA user

// Creates an isolated project with two known tasks via the API, then injects
// the PM's token into the page so the UI loads straight into that project.
async function setupProject(request: APIRequestContext, page: Page) {
  const login = await request.post('/api/auth/login', { data: PM })
  const token = (await login.json()).data.tokens.accessToken
  const headers = { Authorization: `Bearer ${token}` }

  const proj = await request.post('/api/projects', {
    headers,
    data: { name: `E2E Project ${Date.now()}` },
  })
  const projectId = (await proj.json()).data.id

  await request.post(`/api/projects/${projectId}/tasks`, {
    headers,
    data: { title: 'Alpha login task', priority: 'HIGH' },
  })
  await request.post(`/api/projects/${projectId}/tasks`, {
    headers,
    data: { title: 'Beta deploy task', priority: 'LOW' },
  })

  await page.addInitScript((t) => localStorage.setItem('accessToken', t as string), token)
  return projectId
}

const rowByText = (page: Page, text: string) =>
  page.getByTestId('tasks-list').locator('li', { hasText: text })

test.describe('Tasks page — list & create (FE-3/FE-4)', () => {
  test('shows the project tasks', async ({ page, request }) => {
    const projectId = await setupProject(request, page)
    await page.goto(`/projects/${projectId}/tasks`)

    await expect(page.getByTestId('tasks-list')).toBeVisible()
    await expect(rowByText(page, 'Alpha login task')).toBeVisible()
    await expect(rowByText(page, 'Beta deploy task')).toBeVisible()
  })

  test('creates a new task via the form', async ({ page, request }) => {
    const projectId = await setupProject(request, page)
    await page.goto(`/projects/${projectId}/tasks`)

    await page.getByTestId('new-task-title').fill('Gamma review task')
    await page.getByTestId('create-task-submit').click()

    await expect(rowByText(page, 'Gamma review task')).toBeVisible()
  })
})

test.describe('Tasks page — filtering (FE-4)', () => {
  test('search filters the list by title', async ({ page, request }) => {
    const projectId = await setupProject(request, page)
    await page.goto(`/projects/${projectId}/tasks`)

    await page.getByTestId('filter-search').fill('login')

    await expect(rowByText(page, 'Alpha login task')).toBeVisible()
    await expect(rowByText(page, 'Beta deploy task')).toHaveCount(0)
  })

  test('priority filter narrows the list', async ({ page, request }) => {
    const projectId = await setupProject(request, page)
    await page.goto(`/projects/${projectId}/tasks`)

    await page.getByTestId('filter-priority').selectOption('HIGH')

    await expect(rowByText(page, 'Alpha login task')).toBeVisible()
    await expect(rowByText(page, 'Beta deploy task')).toHaveCount(0)
  })
})

test.describe('Tasks page — inline edit (FE-4)', () => {
  test('inline status change persists across reload', async ({ page, request }) => {
    const projectId = await setupProject(request, page)
    await page.goto(`/projects/${projectId}/tasks`)

    // selects in a row are ordered: status, priority, assignee
    const statusSelect = rowByText(page, 'Alpha login task').locator('select').nth(0)
    await statusSelect.selectOption('BLOCKED')

    await page.reload()
    await expect(rowByText(page, 'Alpha login task').locator('select').nth(0)).toHaveValue('BLOCKED')
  })

  test('inline assignee change is reflected by the assignee filter', async ({ page, request }) => {
    const projectId = await setupProject(request, page)
    await page.goto(`/projects/${projectId}/tasks`)

    const assigneeSelect = rowByText(page, 'Alpha login task').locator('select').nth(2)
    // wait for the assignment PATCH to persist before filtering (avoid a race)
    const patched = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && /\/api\/tasks\//.test(r.url())
    )
    await assigneeSelect.selectOption({ label: ASSIGNEE_LABEL })
    await patched

    // filter by that assignee — only the Alpha task should remain
    await page.getByTestId('filter-assignee').selectOption({ label: ASSIGNEE_LABEL })

    await expect(rowByText(page, 'Alpha login task')).toBeVisible()
    await expect(rowByText(page, 'Beta deploy task')).toHaveCount(0)
  })

  test('unassigned filter shows only tasks without an assignee', async ({ page, request }) => {
    const projectId = await setupProject(request, page)
    await page.goto(`/projects/${projectId}/tasks`)

    // assign Alpha, leave Beta unassigned (wait for the PATCH to persist)
    const patched = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && /\/api\/tasks\//.test(r.url())
    )
    await rowByText(page, 'Alpha login task')
      .locator('select')
      .nth(2)
      .selectOption({ label: ASSIGNEE_LABEL })
    await patched

    await page.getByTestId('filter-assignee').selectOption('unassigned')

    await expect(rowByText(page, 'Beta deploy task')).toBeVisible()
    await expect(rowByText(page, 'Alpha login task')).toHaveCount(0)
  })
})
