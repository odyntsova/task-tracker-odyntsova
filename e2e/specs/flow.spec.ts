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
    await expect(page.getByTestId('count-new')).toHaveText('1')

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

  test('a failed move reverts the card to its original column', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('revert'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `R ${Date.now()}` } })).json()).data
    const ticket = (await (await request.post('/api/tickets', {
      headers,
      data: { teamId: team.id, type: 'bug', title: 'Stays put on failure', body: 'b' },
    })).json()).data

    await gotoAs(page, token, '/board')
    await page.getByTestId('board-team-select').selectOption({ value: team.id })
    await expect(page.getByTestId('column-new')).toContainText('Stays put on failure')

    // force the state PATCH to fail so the optimistic move must roll back
    await page.route('**/api/tickets/**', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
        : route.continue()
    )

    const card = page.getByTestId(`card-${ticket.id}`)
    const target = page.getByTestId('column-in_progress')
    const failed = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.status() === 500)
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
    await failed

    // card rolled back to New, error shown, In Progress empty
    await expect(page.getByTestId('column-new')).toContainText('Stays put on failure')
    await expect(page.getByTestId('column-in_progress')).not.toContainText('Stays put on failure')
    await expect(page.getByText(/Reverted/)).toBeVisible()
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

  test('filters narrow the board by epic and by case-insensitive title search', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('epicfilter'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `EF ${Date.now()}` } })).json()).data
    const alpha = (await (await request.post('/api/epics', { headers, data: { teamId: team.id, title: 'Epic Alpha' } })).json()).data
    const beta = (await (await request.post('/api/epics', { headers, data: { teamId: team.id, title: 'Epic Beta' } })).json()).data
    // 3 tickets: two whose titles share "log" (case-insensitive), spread across epics
    await request.post('/api/tickets', { headers, data: { teamId: team.id, type: 'bug', title: 'Login crash', body: 'b', epicId: alpha.id } })
    await request.post('/api/tickets', { headers, data: { teamId: team.id, type: 'bug', title: 'Logout hangs', body: 'b', epicId: beta.id } })
    await request.post('/api/tickets', { headers, data: { teamId: team.id, type: 'feature', title: 'Dark mode', body: 'b', epicId: beta.id } })

    await gotoAs(page, token, '/board')
    await page.getByTestId('board-team-select').selectOption({ value: team.id })
    await expect(page.getByTestId('ticket-count')).toHaveText('3 tickets')

    // filter by epic Alpha → only its single ticket remains
    await page.getByTestId('filter-epic').selectOption({ label: 'Epic Alpha' })
    await expect(page.getByTestId('ticket-count')).toHaveText('1 tickets')
    await expect(page.getByTestId('kanban-board')).toContainText('Login crash')
    await expect(page.getByTestId('kanban-board')).not.toContainText('Logout hangs')
    await expect(page.getByTestId('kanban-board')).not.toContainText('Dark mode')

    // clear, then case-insensitive title search "LOG" → both "Login crash" + "Logout hangs"
    await page.getByTestId('filter-clear').click()
    await expect(page.getByTestId('ticket-count')).toHaveText('3 tickets')
    await page.getByTestId('filter-search').fill('LOG')
    await expect(page.getByTestId('ticket-count')).toHaveText('2 tickets')
    await expect(page.getByTestId('kanban-board')).toContainText('Login crash')
    await expect(page.getByTestId('kanban-board')).toContainText('Logout hangs')
    await expect(page.getByTestId('kanban-board')).not.toContainText('Dark mode')

    // epic + search combine (AND): Beta epic + "log" → only "Logout hangs"
    await page.getByTestId('filter-epic').selectOption({ label: 'Epic Beta' })
    await expect(page.getByTestId('ticket-count')).toHaveText('1 tickets')
    await expect(page.getByTestId('kanban-board')).toContainText('Logout hangs')
    await expect(page.getByTestId('kanban-board')).not.toContainText('Login crash')
  })

  test('board stays usable with 100+ tickets (renders and filters)', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('load'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `L ${Date.now()}` } })).json()).data

    const TYPES = ['bug', 'feature', 'fix']
    const STATES = ['new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done']
    const N = 120
    // Create in batches rather than 120 at once: a cold dev server's connection
    // pool can drop some of a 120-wide burst, which would flake the count below.
    for (let start = 0; start < N; start += 20) {
      await Promise.all(
        Array.from({ length: Math.min(20, N - start) }, (_, j) => {
          const i = start + j
          return request.post('/api/tickets', {
            headers,
            data: {
              teamId: team.id,
              type: TYPES[i % 3],
              state: STATES[i % 5],
              title: `${i % 3 === 0 ? 'Crash' : 'Item'} ${i}`,
              body: `b${i}`,
            },
          })
        })
      )
    }

    await gotoAs(page, token, '/board')
    await page.getByTestId('board-team-select').selectOption({ value: team.id })
    // all 120 render and the board is visible/usable
    await expect(page.getByTestId('ticket-count')).toHaveText(`${N} tickets`)
    await expect(page.getByTestId('kanban-board')).toBeVisible()

    // filtering still narrows the large set: type=bug → 40 of 120
    await page.getByTestId('filter-type').selectOption('bug')
    await expect(page.getByTestId('ticket-count')).toHaveText('40 tickets')
  })

  test('board shows exactly the 5 workflow columns in order and cards show their type', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('cols'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `C ${Date.now()}` } })).json()).data
    await request.post('/api/tickets', { headers, data: { teamId: team.id, type: 'bug', title: 'Typed card', body: 'b' } })

    await gotoAs(page, token, '/board')
    await page.getByTestId('board-team-select').selectOption({ value: team.id })

    const columnIds = await page
      .getByTestId('kanban-board')
      .locator('[data-testid^="column-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    expect(columnIds).toEqual([
      'column-new',
      'column-ready_for_implementation',
      'column-in_progress',
      'column-ready_for_acceptance',
      'column-done',
    ])

    // the card shows its type next to the title
    const card = page.getByTestId('column-new').locator('.ticket-card').first()
    await expect(card).toContainText('Typed card')
    await expect(card).toContainText('bug')
  })

  test('epics screen: create, edit, and delete an epic through the UI', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('epicui'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `EU ${Date.now()}` } })).json()).data

    await gotoAs(page, token, '/epics')
    await page.getByTestId('epic-team-select').selectOption({ value: team.id })

    // create
    await page.getByTestId('epic-title-input').fill('Checkout epic')
    await page.getByTestId('create-epic-submit').click()
    await expect(page.getByTestId('epics-list')).toContainText('Checkout epic')

    // edit — the screen uses two prompts (title, then description)
    let promptN = 0
    page.on('dialog', (d) => d.accept(promptN++ === 0 ? 'Checkout epic v2' : 'a description'))
    await page.locator('[data-testid^="edit-epic-"]').first().click()
    await expect(page.getByTestId('epics-list')).toContainText('Checkout epic v2')

    // delete
    await page.locator('[data-testid^="delete-epic-"]').first().click()
    await expect(page.getByTestId('epics-empty')).toBeVisible()
  })

  test('deleting a ticket is gated by a confirmation dialog', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('tdel'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `TD ${Date.now()}` } })).json()).data
    const ticket = (await (await request.post('/api/tickets', {
      headers,
      data: { teamId: team.id, type: 'bug', title: 'Disposable', body: 'b' },
    })).json()).data

    await gotoAs(page, token, `/tickets/${ticket.id}`)
    await expect(page.getByTestId('ticket-page')).toBeVisible()

    // dismiss the confirm → ticket stays
    page.once('dialog', (d) => d.dismiss())
    await page.getByTestId('ticket-delete').click()
    await expect(page.getByTestId('ticket-page')).toBeVisible()

    // accept the confirm → ticket deleted, navigates back to the board
    page.once('dialog', (d) => d.accept())
    await page.getByTestId('ticket-delete').click()
    await expect(page.getByTestId('board-page')).toBeVisible()

    await page.getByTestId('board-team-select').selectOption({ value: team.id })
    await expect(page.getByTestId('kanban-board')).not.toContainText('Disposable')
  })
})
