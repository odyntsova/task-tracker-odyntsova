import { test, expect, APIRequestContext } from '@playwright/test'

const PM = { email: 'pm@example.com', password: 'password123' }

async function pmHeaders(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: PM })
  const token = (await res.json()).data.tokens.accessToken
  return { Authorization: `Bearer ${token}` }
}

test.describe('Notifications (NOTIF-1/2)', () => {
  test('assignee sees an unread notification and can clear it', async ({ page, request }) => {
    // a brand-new user → no prior notifications (deterministic)
    const email = `notif_${Date.now()}@example.com`
    const reg = await request.post('/api/auth/register', {
      data: { name: 'Notif User', email, password: 'password123' },
    })
    const { user, tokens } = (await reg.json()).data

    // PM creates a project + task, then assigns it to the new user
    const headers = await pmHeaders(request)
    const project = (await (await request.post('/api/projects', { headers, data: { name: `N ${Date.now()}` } })).json()).data
    const task = (await (await request.post(`/api/projects/${project.id}/tasks`, { headers, data: { title: 'Ping me' } })).json()).data
    await request.patch(`/api/tasks/${task.id}`, { headers, data: { assigneeId: user.id } })

    // the new user opens the dashboard
    await page.addInitScript((t) => localStorage.setItem('accessToken', t as string), tokens.accessToken)
    await page.goto('/')

    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await expect(page.getByTestId('notifications-unread')).toHaveText('(1)')
    await expect(page.getByTestId('notifications-list')).toContainText('Ping me')

    // mark all read → unread count drops to 0
    await page.getByTestId('mark-all-read').click()
    await expect(page.getByTestId('notifications-unread')).toHaveText('(0)')
  })
})
