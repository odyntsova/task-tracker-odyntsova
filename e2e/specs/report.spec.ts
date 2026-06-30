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

test.describe('Project report (REP-1/REP-2)', () => {
  test('shows task metrics, status breakdown and velocity', async ({ page, request }) => {
    const t = await token(request)
    const headers = { Authorization: `Bearer ${t}` }

    const project = (await (await request.post('/api/projects', { headers, data: { name: `Rep ${Date.now()}` } })).json()).data
    const sprint = (
      await (
        await request.post(`/api/projects/${project.id}/sprints`, {
          headers,
          data: { name: 'Rep Sprint', startDate: '2026-07-01', endDate: '2026-07-14' },
        })
      ).json()
    ).data

    // create 2 tasks, put both in the sprint, complete one
    const a = (await (await request.post(`/api/projects/${project.id}/tasks`, { headers, data: { title: 'RA' } })).json()).data
    const b = (await (await request.post(`/api/projects/${project.id}/tasks`, { headers, data: { title: 'RB' } })).json()).data
    for (const id of [a.id, b.id]) {
      await request.patch(`/api/tasks/${id}`, { headers, data: { sprintId: sprint.id } })
    }
    await request.patch(`/api/tasks/${a.id}`, { headers, data: { status: 'IN_PROGRESS' } })
    await request.patch(`/api/tasks/${a.id}`, { headers, data: { status: 'IN_REVIEW' } })
    await request.patch(`/api/tasks/${a.id}`, { headers, data: { status: 'DONE' } })

    await gotoAs(page, t, `/projects/${project.id}/report`)

    await expect(page.getByTestId('report-page')).toBeVisible()
    await expect(page.getByTestId('report-total')).toHaveText('Total: 2')
    await expect(page.getByTestId('report-status-DONE')).toHaveText('1')
    await expect(page.getByTestId('report-completion')).toContainText('50%')
    await expect(page.getByTestId(`velocity-${sprint.id}`)).toContainText('Rep Sprint')
    await expect(page.getByTestId(`velocity-${sprint.id}`)).toContainText('1')
  })
})
