import { test, expect, APIRequestContext, Page, Locator } from '@playwright/test'

const PM = { email: 'pm@example.com', password: 'password123' }

async function token(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: PM })
  return (await res.json()).data.tokens.accessToken as string
}

async function createProject(request: APIRequestContext, t: string) {
  const res = await request.post('/api/projects', {
    headers: { Authorization: `Bearer ${t}` },
    data: { name: `Kanban ${Date.now()}` },
  })
  return (await res.json()).data.id as string
}

async function createTask(request: APIRequestContext, t: string, projectId: string, title: string) {
  await request.post(`/api/projects/${projectId}/tasks`, {
    headers: { Authorization: `Bearer ${t}` },
    data: { title, priority: 'MEDIUM' },
  })
}

async function gotoBoard(page: Page, t: string, projectId: string) {
  await page.addInitScript((tok) => localStorage.setItem('accessToken', tok as string), t)
  await page.goto(`/projects/${projectId}/board`)
  await expect(page.getByTestId('kanban-board')).toBeVisible()
}

// Simulates an HTML5 drag&drop by dispatching the drag events with one shared
// DataTransfer — Playwright's mouse-based dragTo does not trigger native DnD.
async function htmlDragDrop(page: Page, source: Locator, target: Locator) {
  const s = await source.elementHandle()
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
}

test.describe('Kanban board (SPRINT-2)', () => {
  test('groups tasks into status columns', async ({ page, request }) => {
    const t = await token(request)
    const projectId = await createProject(request, t)
    await createTask(request, t, projectId, 'Card A')
    await createTask(request, t, projectId, 'Card B')

    await gotoBoard(page, t, projectId)

    // both new tasks default to TODO
    await expect(page.getByTestId('kanban-count-TODO')).toHaveText('(2)')
    await expect(page.getByTestId('kanban-count-DONE')).toHaveText('(0)')
  })

  test('valid drag TODO → IN_PROGRESS moves the card', async ({ page, request }) => {
    const t = await token(request)
    const projectId = await createProject(request, t)
    await createTask(request, t, projectId, 'Movable card')
    await gotoBoard(page, t, projectId)

    const card = page.getByTestId('kanban-column-TODO').locator('li', { hasText: 'Movable card' })
    const target = page.getByTestId('kanban-column-IN_PROGRESS')
    await htmlDragDrop(page, card, target)

    await expect(
      page.getByTestId('kanban-column-IN_PROGRESS').locator('li', { hasText: 'Movable card' })
    ).toBeVisible()
    await expect(page.getByTestId('kanban-count-IN_PROGRESS')).toHaveText('(1)')
  })

  test('illegal drag TODO → DONE is rejected and the card stays put', async ({ page, request }) => {
    const t = await token(request)
    const projectId = await createProject(request, t)
    await createTask(request, t, projectId, 'Stuck card')
    await gotoBoard(page, t, projectId)

    const card = page.getByTestId('kanban-column-TODO').locator('li', { hasText: 'Stuck card' })
    const done = page.getByTestId('kanban-column-DONE')
    await htmlDragDrop(page, card, done)

    await expect(page.getByTestId('kanban-error')).toBeVisible()
    // card reverted to TODO
    await expect(
      page.getByTestId('kanban-column-TODO').locator('li', { hasText: 'Stuck card' })
    ).toBeVisible()
    await expect(page.getByTestId('kanban-count-DONE')).toHaveText('(0)')
  })
})
