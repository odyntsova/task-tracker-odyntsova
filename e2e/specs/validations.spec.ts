import { test, expect } from '@playwright/test'
import { verifiedSession, gotoAs, uniqueEmail } from '../helpers'

// Spec validation rules, verified end-to-end through the UI.
test.describe('Validation rules (UI)', () => {
  test('deleting a team that has an epic shows a 409 validation message', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('val'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `T ${Date.now()}` } })).json()).data
    await request.post('/api/epics', { headers, data: { teamId: team.id, title: 'Checkout' } })

    await gotoAs(page, token, '/teams')
    await page.getByTestId(`delete-team-${team.id}`).click()
    await expect(page.getByTestId('error')).toContainText('Cannot delete a team')
  })

  test('deleting an epic referenced by a ticket shows a 409 validation message', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('val'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `T ${Date.now()}` } })).json()).data
    const epic = (await (await request.post('/api/epics', { headers, data: { teamId: team.id, title: 'Checkout' } })).json()).data
    await request.post('/api/tickets', { headers, data: { teamId: team.id, type: 'bug', title: 'T', body: 'b', epicId: epic.id } })

    await gotoAs(page, token, '/epics')
    await page.getByTestId('epic-team-select').selectOption({ value: team.id })
    await page.getByTestId(`delete-epic-${epic.id}`).click()
    await expect(page.getByTestId('error')).toContainText('Cannot delete an epic')
  })

  test('changing a ticket\'s team clears the selected epic', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('val'))
    const headers = { Authorization: `Bearer ${token}` }
    const teamA = (await (await request.post('/api/teams', { headers, data: { name: `A ${Date.now()}` } })).json()).data
    const teamB = (await (await request.post('/api/teams', { headers, data: { name: `B ${Date.now()}` } })).json()).data
    const epicA = (await (await request.post('/api/epics', { headers, data: { teamId: teamA.id, title: 'A-epic' } })).json()).data
    const ticket = (await (await request.post('/api/tickets', { headers, data: { teamId: teamA.id, type: 'bug', title: 'T', body: 'b', epicId: epicA.id } })).json()).data

    await gotoAs(page, token, `/tickets/${ticket.id}`)
    await expect(page.getByTestId('ticket-epic')).toHaveValue(epicA.id)

    await page.getByTestId('ticket-team').selectOption({ value: teamB.id })
    await expect(page.getByTestId('ticket-epic')).toHaveValue('') // cleared on team change
  })
})
