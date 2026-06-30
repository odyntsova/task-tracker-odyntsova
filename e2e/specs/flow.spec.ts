import { test, expect } from '@playwright/test'
import { verifiedSession, gotoAs, uniqueEmail } from '../helpers'

// End-to-end of the core verified-user journey, driven through the UI.
test.describe('Core flow (verified user)', () => {
  test('create team → ticket → board → drag → open → comment', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('flow'))
    const teamName = `Team ${Date.now()}`

    // 1. create a team
    await gotoAs(page, token, '/teams')
    await page.getByTestId('team-name-input').fill(teamName)
    await page.getByTestId('create-team-submit').click()
    await expect(page.getByTestId('teams-list')).toContainText(teamName)

    // 2. create a ticket on the board
    await page.goto('/board')
    await page.getByTestId('board-team-select').selectOption({ label: teamName })
    await page.getByTestId('new-ticket-button').click()
    await page.getByTestId('ticket-title').fill('Payment fails for expired card')
    await page.getByTestId('ticket-body').fill('Steps to reproduce…')
    await page.getByTestId('ticket-type').selectOption('bug')
    await page.getByTestId('ticket-save').click()

    // lands on the ticket details page
    await expect(page.getByTestId('ticket-page')).toBeVisible()
    await expect(page.getByTestId('ticket-meta')).toContainText('Created by')

    // 3. board shows the new ticket in the New column
    await page.goto('/board')
    await page.getByTestId('board-team-select').selectOption({ label: teamName })
    const newCol = page.getByTestId('column-new')
    await expect(newCol).toContainText('Payment fails for expired card')
    await expect(page.getByTestId('count-new')).toHaveText('(1)')

    // 4. drag the card to In Progress (HTML5 dnd) and verify it persists
    const card = newCol.locator('li').first()
    const target = page.getByTestId('column-in_progress')
    const patched = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && /\/api\/tickets\//.test(r.url())
    )
    const s = await card.elementHandle()
    const t = await target.elementHandle()
    await page.evaluate(
      ([src, tgt]) => {
        const dt = new DataTransfer()
        const fire = (el: Element, type: string) =>
          el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
        fire(src as Element, 'dragstart')
        fire(tgt as Element, 'dragover')
        fire(tgt as Element, 'drop')
        fire(src as Element, 'dragend')
      },
      [s, t]
    )
    await patched
    await expect(page.getByTestId('column-in_progress')).toContainText('Payment fails for expired card')

    // survives a refresh (persisted server-side)
    await page.reload()
    await page.getByTestId('board-team-select').selectOption({ label: teamName })
    await expect(page.getByTestId('column-in_progress')).toContainText('Payment fails for expired card')

    // 5. open the ticket and add a comment
    await page.getByTestId('column-in_progress').locator('li').first().click()
    await expect(page.getByTestId('ticket-page')).toBeVisible()
    await page.getByTestId('comment-input').fill('Looking into it')
    await page.getByTestId('comment-submit').click()
    await expect(page.getByTestId('comments-list')).toContainText('Looking into it')
  })

  test('filters narrow the board by type', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('filter'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `F ${Date.now()}` } })).json()).data
    await request.post('/api/tickets', { headers, data: { teamId: team.id, type: 'bug', title: 'A bug', body: 'b' } })
    await request.post('/api/tickets', { headers, data: { teamId: team.id, type: 'feature', title: 'A feature', body: 'b' } })

    await gotoAs(page, token, '/board')
    await page.getByTestId('board-team-select').selectOption({ value: team.id })
    await expect(page.getByTestId('ticket-count')).toHaveText('2 tickets')

    await page.getByTestId('filter-type').selectOption('bug')
    await expect(page.getByTestId('ticket-count')).toHaveText('1 tickets')
    await expect(page.getByTestId('kanban-board')).toContainText('A bug')
    await expect(page.getByTestId('kanban-board')).not.toContainText('A feature')
  })
})
