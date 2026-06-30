import { useEffect, useState, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { sprintsApi, authApi } from '@/services/api'
import type { Sprint, UserRole } from '@/types'

const CAN_MANAGE: UserRole[] = ['ADMIN', 'PM']

export function SprintsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // create-sprint form
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function load() {
    if (!projectId) return
    setLoading(true)
    sprintsApi
      .list(projectId)
      .then(({ data }) => setSprints(data.data))
      .catch(() => setError('Failed to load sprints'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [projectId])

  useEffect(() => {
    authApi.me().then(({ data }) => setRole(data.data.role)).catch(() => {})
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!projectId) return
    setCreating(true)
    setCreateError(null)
    try {
      await sprintsApi.create(projectId, { name, startDate, endDate })
      setName('')
      setStartDate('')
      setEndDate('')
      load()
    } catch {
      setCreateError('Failed to create sprint (check the dates — end must be after start)')
    } finally {
      setCreating(false)
    }
  }

  const canManage = role !== null && CAN_MANAGE.includes(role)

  return (
    <main data-testid="sprints-page">
      <h1>Sprints</h1>
      <p>
        <Link to={`/projects/${projectId}/tasks`}>← Back to tasks</Link>
      </p>

      {canManage && (
        <form onSubmit={handleCreate} data-testid="create-sprint-form">
          <input
            data-testid="sprint-name"
            type="text"
            placeholder="Sprint name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            data-testid="sprint-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <input
            data-testid="sprint-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
          <button data-testid="create-sprint-submit" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create sprint'}
          </button>
          {createError && (
            <span data-testid="create-sprint-error" role="alert">
              {createError}
            </span>
          )}
        </form>
      )}

      {loading ? (
        <p data-testid="loading">Loading…</p>
      ) : error ? (
        <p data-testid="error" role="alert">{error}</p>
      ) : sprints.length === 0 ? (
        <p data-testid="empty-state">No sprints yet.</p>
      ) : (
        <ul data-testid="sprints-list">
          {sprints.map((s) => (
            <li key={s.id} data-testid={`sprint-item-${s.id}`}>
              <span data-testid="sprint-name-label">{s.name}</span>{' '}
              <span data-testid="sprint-dates">
                {s.startDate.slice(0, 10)} → {s.endDate.slice(0, 10)}
              </span>{' '}
              <Link data-testid={`burndown-link-${s.id}`} to={`/projects/${projectId}/sprints/${s.id}/burndown`}>
                Burndown →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
