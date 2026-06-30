import { test, expect } from '@playwright/test'
import { verifiedSession, gotoAs, uniqueEmail } from '../helpers'

// The author-only edit/delete of comments, driven through the UI.
// TicketPage uses window.prompt (edit) and window.confirm (delete), so each
// action is paired with a one-shot dialog handler.
test.describe('Comments: edit & delete own (UI)', () => {
  test('author edits then deletes their own comment', async ({ page, request }) => {
    const { token } = await verifiedSession(request, uniqueEmail('comment'))
    const headers = { Authorization: `Bearer ${token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `C ${Date.now()}` } })).json()).data
    const ticket = (await (await request.post('/api/tickets', {
      headers,
      data: { teamId: team.id, type: 'bug', title: 'Has comments', body: 'b' },
    })).json()).data

    await gotoAs(page, token, `/tickets/${ticket.id}`)

    // add a comment through the form
    await page.getByTestId('comment-input').fill('First take')
    await page.getByTestId('comment-submit').click()
    await expect(page.getByTestId('comments-list')).toContainText('First take')

    const commentItem = page.getByTestId('comments-list').locator('li').first()
    const editBtn = commentItem.getByRole('button', { name: 'Edit' })
    const deleteBtn = commentItem.getByRole('button', { name: 'Delete' })

    // edit: the prompt is pre-filled with the current body; return the new text
    page.once('dialog', (d) => d.accept('Edited take'))
    await editBtn.click()
    await expect(page.getByTestId('comments-list')).toContainText('Edited take')
    await expect(page.getByTestId('comments-list')).not.toContainText('First take')

    // delete: accept the confirm dialog
    page.once('dialog', (d) => d.accept())
    await deleteBtn.click()
    await expect(page.getByTestId('comments-empty')).toBeVisible()
  })

  test("another user cannot see edit/delete controls on someone else's comment", async ({ page, request }) => {
    const author = await verifiedSession(request, uniqueEmail('author'))
    const headers = { Authorization: `Bearer ${author.token}` }
    const team = (await (await request.post('/api/teams', { headers, data: { name: `C2 ${Date.now()}` } })).json()).data
    const ticket = (await (await request.post('/api/tickets', {
      headers,
      data: { teamId: team.id, type: 'bug', title: 'Shared ticket', body: 'b' },
    })).json()).data
    await request.post(`/api/tickets/${ticket.id}/comments`, { headers, data: { body: 'author note' } })

    // a different verified user opens the same ticket
    const other = await verifiedSession(request, uniqueEmail('other'))
    await gotoAs(page, other.token, `/tickets/${ticket.id}`)

    const commentItem = page.getByTestId('comments-list').locator('li').first()
    await expect(commentItem).toContainText('author note')
    await expect(commentItem.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    await expect(commentItem.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  })
})
