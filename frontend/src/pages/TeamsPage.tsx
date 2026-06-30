import { useEffect, useState, FormEvent } from 'react'
import { teamsApi } from '@/services/api'
import { Loading, ErrorMessage, SuccessMessage } from '@/components/AsyncState'
import { isAxiosError } from 'axios'
import type { Team } from '@/types'

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  function notify(msg: string) {
    setSuccess(msg)
    setActionError(null)
  }

  function load() {
    setLoading(true)
    teamsApi.list().then(({ data }) => setTeams(data.data)).catch(() => setError('Failed to load teams')).finally(() => setLoading(false))
  }
  useEffect(load, [])

  function apiError(err: unknown, fallback: string) {
    return (isAxiosError(err) && (err.response?.data as { error?: string })?.error) || fallback
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setActionError(null)
    try {
      await teamsApi.create(name)
      notify(`Team "${name}" created`)
      setName('')
      load()
    } catch (err) {
      setSuccess(null)
      setActionError(apiError(err, 'Failed to create team'))
    }
  }

  async function rename(team: Team) {
    const next = prompt('New team name', team.name)
    if (!next) return
    setActionError(null)
    try {
      await teamsApi.rename(team.id, next)
      notify('Team renamed')
      load()
    } catch (err) {
      setSuccess(null)
      setActionError(apiError(err, 'Failed to rename team'))
    }
  }

  async function remove(team: Team) {
    setActionError(null)
    try {
      await teamsApi.remove(team.id)
      notify('Team deleted')
      load()
    } catch (err) {
      setSuccess(null)
      setActionError(apiError(err, 'Failed to delete team'))
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorMessage>{error}</ErrorMessage>

  return (
    <section data-testid="teams-page">
      <h1>Teams</h1>
      <form onSubmit={create} data-testid="create-team-form">
        <input data-testid="team-name-input" placeholder="New team name" value={name}
          onChange={(e) => setName(e.target.value)} required />
        <button data-testid="create-team-submit" type="submit">Create team</button>
      </form>
      {actionError && <ErrorMessage>{actionError}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {teams.length === 0 ? (
        <p data-testid="teams-empty">No teams yet.</p>
      ) : (
        <ul data-testid="teams-list">
          {teams.map((t) => (
            <li key={t.id} data-testid={`team-${t.id}`}>
              <span>{t.name}</span>
              <button data-testid={`rename-team-${t.id}`} onClick={() => rename(t)}>Rename</button>
              <button data-testid={`delete-team-${t.id}`} onClick={() => remove(t)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
