import { useEffect, useState, FormEvent } from 'react'
import { teamsApi, epicsApi } from '@/services/api'
import { Loading, ErrorMessage, SuccessMessage } from '@/components/AsyncState'
import { isAxiosError } from 'axios'
import type { Team, Epic } from '@/types'

export function EpicsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [epics, setEpics] = useState<Epic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    teamsApi
      .list()
      .then(({ data }) => {
        setTeams(data.data)
        if (data.data[0]) setTeamId(data.data[0].id)
      })
      .catch(() => setError('Failed to load teams'))
      .finally(() => setLoading(false))
  }, [])

  function loadEpics(id: string) {
    if (!id) return
    epicsApi.list(id).then(({ data }) => setEpics(data.data)).catch(() => {})
  }
  useEffect(() => loadEpics(teamId), [teamId])

  const apiError = (err: unknown, fb: string) =>
    (isAxiosError(err) && (err.response?.data as { error?: string })?.error) || fb

  async function create(e: FormEvent) {
    e.preventDefault()
    setActionError(null)
    try {
      await epicsApi.create(teamId, title, description || null)
      setSuccess(`Epic "${title}" created`)
      setTitle('')
      setDescription('')
      loadEpics(teamId)
    } catch (err) {
      setSuccess(null)
      setActionError(apiError(err, 'Failed to create epic'))
    }
  }

  async function edit(epic: Epic) {
    const nextTitle = prompt('Epic title', epic.title)
    if (nextTitle === null) return
    const nextDesc = prompt('Description (optional)', epic.description ?? '')
    setActionError(null)
    try {
      await epicsApi.update(epic.id, { title: nextTitle, description: nextDesc || null })
      setSuccess('Epic updated')
      loadEpics(teamId)
    } catch (err) {
      setSuccess(null)
      setActionError(apiError(err, 'Failed to update epic'))
    }
  }

  async function remove(epic: Epic) {
    setActionError(null)
    try {
      await epicsApi.remove(epic.id)
      setSuccess('Epic deleted')
      loadEpics(teamId)
    } catch (err) {
      setSuccess(null)
      setActionError(apiError(err, 'Failed to delete epic'))
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorMessage>{error}</ErrorMessage>

  return (
    <section data-testid="epics-page">
      <h1>Epics</h1>
      {teams.length === 0 ? (
        <p data-testid="no-teams">Create a team first.</p>
      ) : (
        <>
          <label>
            Team:{' '}
            <select data-testid="epic-team-select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <form onSubmit={create} data-testid="create-epic-form">
            <input data-testid="epic-title-input" placeholder="Epic title" value={title}
              onChange={(e) => setTitle(e.target.value)} required />
            <input data-testid="epic-desc-input" placeholder="Description (optional)" value={description}
              onChange={(e) => setDescription(e.target.value)} />
            <button data-testid="create-epic-submit" type="submit">Create epic</button>
          </form>
          {actionError && <ErrorMessage>{actionError}</ErrorMessage>}
          {success && <SuccessMessage>{success}</SuccessMessage>}

          {epics.length === 0 ? (
            <p data-testid="epics-empty">No epics for this team.</p>
          ) : (
            <ul data-testid="epics-list">
              {epics.map((ep) => (
                <li key={ep.id} data-testid={`epic-${ep.id}`}>
                  <span>{ep.title}</span>
                  <button data-testid={`edit-epic-${ep.id}`} onClick={() => edit(ep)}>Edit</button>
                  <button data-testid={`delete-epic-${ep.id}`} onClick={() => remove(ep)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
