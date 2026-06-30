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

test.describe('Burndown chart (SPRINT-4)', () => {
  test('renders the chart and reflects a completed task', async ({ page, request }) => {
    const t = await token(request)
    const headers = { Authorization: `Bearer ${t}` }

    const project = (await (await request.post('/api/projects', { headers, data: { name: `BD ${Date.now()}` } })).json()).data
    const sprint = (
      await (
        await request.post(`/api/projects/${project.id}/sprints`, {
          headers,
          data: { name: 'Burndown sprint', startDate: '2026-07-01', endDate: '2026-07-03' },
        })
      ).json()
    ).data

    // two tasks in the sprint
    const task1 = (await (await request.post(`/api/projects/${project.id}/tasks`, { headers, data: { title: 'BD-A' } })).json()).data
    await request.post(`/api/projects/${project.id}/tasks`, { headers, data: { title: 'BD-B' } })
    for (const id of [task1.id]) {
      await request.patch(`/api/tasks/${id}`, { headers, data: { sprintId: sprint.id } })
    }
    // also attach BD-B to the sprint
    const tasks = (await (await request.get(`/api/projects/${project.id}/tasks`, { headers })).json()).data
    for (const tk of tasks) {
      await request.patch(`/api/tasks/${tk.id}`, { headers, data: { sprintId: sprint.id } })
    }
    // complete BD-A (IN_PROGRESS → IN_REVIEW → DONE)
    await request.patch(`/api/tasks/${task1.id}`, { headers, data: { status: 'IN_PROGRESS' } })
    await request.patch(`/api/tasks/${task1.id}`, { headers, data: { status: 'IN_REVIEW' } })
    await request.patch(`/api/tasks/${task1.id}`, { headers, data: { status: 'DONE' } })

    await gotoAs(page, t, `/projects/${project.id}/sprints/${sprint.id}/burndown`)

    await expect(page.getByTestId('burndown-page')).toBeVisible()
    await expect(page.getByTestId('burndown-chart')).toBeVisible()
    await expect(page.getByTestId('burndown-total')).toHaveText('Total tasks: 2')
    // last day remaining = 1 (one task completed)
    await expect(page.getByTestId('burndown-remaining-2026-07-03')).toHaveText('1')
  })
})
