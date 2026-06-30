import { app, request, prisma, cleanDb, authedUser } from './helpers'

let auth: string
beforeEach(async () => {
  await cleanDb()
  ;({ auth } = await authedUser())
})
afterAll(async () => {
  await cleanDb()
  await prisma.$disconnect()
})

const post = (url: string, body: object) => request(app).post(url).set('Authorization', auth).send(body)
const get = (url: string) => request(app).get(url).set('Authorization', auth)
const patch = (url: string, body: object) => request(app).patch(url).set('Authorization', auth).send(body)
const del = (url: string) => request(app).delete(url).set('Authorization', auth)

async function makeTeam(name = 'Payments') {
  return (await post('/api/teams', { name })).body.data
}

describe('Teams', () => {
  it('creates, lists, renames; enforces case-insensitive uniqueness (409)', async () => {
    const team = await makeTeam('Payments')
    expect(team.id).toBeTruthy()

    const dup = await post('/api/teams', { name: 'payments' })
    expect(dup.status).toBe(409)

    const list = await get('/api/teams')
    expect(list.body.data).toHaveLength(1)

    const renamed = await patch(`/api/teams/${team.id}`, { name: 'Payments Team' })
    expect(renamed.status).toBe(200)
    expect(renamed.body.data.name).toBe('Payments Team')
  })

  it('rejects an empty name (422)', async () => {
    expect((await post('/api/teams', { name: '   ' })).status).toBe(422)
  })

  it('cannot delete a team that has epics or tickets (409); can delete when empty (204)', async () => {
    const team = await makeTeam()
    await post('/api/epics', { teamId: team.id, title: 'Checkout' })
    expect((await del(`/api/teams/${team.id}`)).status).toBe(409)

    // remove epic, add a ticket → still blocked
    const epics = (await get(`/api/epics?teamId=${team.id}`)).body.data
    await del(`/api/epics/${epics[0].id}`)
    await post('/api/tickets', { teamId: team.id, type: 'bug', title: 'T', body: 'B' })
    expect((await del(`/api/teams/${team.id}`)).status).toBe(409)

    const empty = await makeTeam('Empty')
    expect((await del(`/api/teams/${empty.id}`)).status).toBe(204)
  })
})

describe('Epics', () => {
  it('creates under a team and cannot be deleted while referenced (409)', async () => {
    const team = await makeTeam()
    const epic = (await post('/api/epics', { teamId: team.id, title: 'Checkout' })).body.data
    await post('/api/tickets', { teamId: team.id, type: 'feature', title: 'T', body: 'B', epicId: epic.id })

    expect((await del(`/api/epics/${epic.id}`)).status).toBe(409)
  })

  it('rejects creation under a non-existent team (422)', async () => {
    const res = await post('/api/epics', { teamId: '00000000-0000-0000-0000-000000000000', title: 'X' })
    expect(res.status).toBe(422)
  })
})

describe('Tickets', () => {
  it('creates with required fields; createdBy from token; defaults state=new', async () => {
    const team = await makeTeam()
    const res = await post('/api/tickets', { teamId: team.id, type: 'bug', title: 'Pay fails', body: 'details' })
    expect(res.status).toBe(201)
    expect(res.body.data.state).toBe('new')
    expect(res.body.data.createdBy.email).toBe('user@example.com')
  })

  it('rejects an invalid type/state and an empty body (422)', async () => {
    const team = await makeTeam()
    expect((await post('/api/tickets', { teamId: team.id, type: 'task', title: 'T', body: 'B' })).status).toBe(422)
    expect((await post('/api/tickets', { teamId: team.id, type: 'bug', title: 'T', body: '   ' })).status).toBe(422)
  })

  it('rejects an epic from a different team (422)', async () => {
    const teamA = await makeTeam('A')
    const teamB = await makeTeam('B')
    const epicB = (await post('/api/epics', { teamId: teamB.id, title: 'B-epic' })).body.data
    const res = await post('/api/tickets', { teamId: teamA.id, type: 'bug', title: 'T', body: 'B', epicId: epicB.id })
    expect(res.status).toBe(422)
  })

  it('state change persists; board lists by team ordered by modifiedAt desc', async () => {
    const team = await makeTeam()
    const t1 = (await post('/api/tickets', { teamId: team.id, type: 'bug', title: 'first', body: 'b' })).body.data
    const t2 = (await post('/api/tickets', { teamId: team.id, type: 'feature', title: 'second', body: 'b' })).body.data

    await patch(`/api/tickets/${t1.id}`, { state: 'in_progress' })
    const stored = await prisma.ticket.findUnique({ where: { id: t1.id } })
    expect(stored!.state).toBe('in_progress')

    const board = await get(`/api/tickets?teamId=${team.id}`)
    expect(board.body.data[0].id).toBe(t1.id) // most recently modified first
    expect(board.body.data).toHaveLength(2)
    expect(t2).toBeTruthy()
  })

  it('filters by type and epic, and searches title (case-insensitive)', async () => {
    const team = await makeTeam()
    const epic = (await post('/api/epics', { teamId: team.id, title: 'E' })).body.data
    await post('/api/tickets', { teamId: team.id, type: 'bug', title: 'Login broken', body: 'b', epicId: epic.id })
    await post('/api/tickets', { teamId: team.id, type: 'feature', title: 'Add retry', body: 'b' })

    expect((await get(`/api/tickets?teamId=${team.id}&type=bug`)).body.data).toHaveLength(1)
    expect((await get(`/api/tickets?teamId=${team.id}&epicId=${epic.id}`)).body.data).toHaveLength(1)
    expect((await get(`/api/tickets?teamId=${team.id}&q=LOGIN`)).body.data).toHaveLength(1)
  })

  it('does not advance modifiedAt when saving unchanged values', async () => {
    const team = await makeTeam()
    const t = (await post('/api/tickets', { teamId: team.id, type: 'bug', title: 'T', body: 'B' })).body.data
    const before = (await prisma.ticket.findUnique({ where: { id: t.id } }))!.modifiedAt

    await patch(`/api/tickets/${t.id}`, { title: 'T', type: 'bug' }) // no-op
    const after = (await prisma.ticket.findUnique({ where: { id: t.id } }))!.modifiedAt
    expect(after.getTime()).toBe(before.getTime())
  })

  it('deleting a ticket also deletes its comments (cascade)', async () => {
    const team = await makeTeam()
    const t = (await post('/api/tickets', { teamId: team.id, type: 'bug', title: 'T', body: 'B' })).body.data
    await post(`/api/tickets/${t.id}/comments`, { body: 'hi' })

    expect((await del(`/api/tickets/${t.id}`)).status).toBe(204)
    expect(await prisma.comment.count({ where: { ticketId: t.id } })).toBe(0)
  })
})

describe('Comments', () => {
  it('adds comments (chronological), rejects empty, does not bump ticket modifiedAt', async () => {
    const team = await makeTeam()
    const t = (await post('/api/tickets', { teamId: team.id, type: 'bug', title: 'T', body: 'B' })).body.data
    const before = (await prisma.ticket.findUnique({ where: { id: t.id } }))!.modifiedAt

    expect((await post(`/api/tickets/${t.id}/comments`, { body: '' })).status).toBe(422)
    await post(`/api/tickets/${t.id}/comments`, { body: 'first' })
    await post(`/api/tickets/${t.id}/comments`, { body: 'second' })

    const list = await get(`/api/tickets/${t.id}/comments`)
    expect(list.body.data.map((c: { body: string }) => c.body)).toEqual(['first', 'second'])

    const after = (await prisma.ticket.findUnique({ where: { id: t.id } }))!.modifiedAt
    expect(after.getTime()).toBe(before.getTime()) // comments do not change the ticket
  })
})
