import { useEffect, useState, useCallback, DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamsApi, epicsApi, ticketsApi, TicketFilters } from '@/services/api'
import { Loading, ErrorMessage } from '@/components/AsyncState'
import { TICKET_STATES, TICKET_TYPES, STATE_LABEL } from '@/types'
import type { Team, Epic, Ticket, TicketType, TicketState } from '@/types'

export function BoardPage() {
  const navigate = useNavigate()
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [epics, setEpics] = useState<Epic[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  // filters
  const [type, setType] = useState<TicketType | ''>('')
  const [epicId, setEpicId] = useState('')
  const [q, setQ] = useState('')
  const clearFilters = () => {
    setType('')
    setEpicId('')
    setQ('')
  }

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

  useEffect(() => {
    if (teamId) epicsApi.list(teamId).then(({ data }) => setEpics(data.data)).catch(() => {})
  }, [teamId])

  const loadTickets = useCallback(() => {
    if (!teamId) {
      setTickets([])
      return
    }
    const filters: TicketFilters = {}
    if (type) filters.type = type
    if (epicId) filters.epicId = epicId
    if (q.trim()) filters.q = q.trim()
    ticketsApi.list(teamId, filters).then(({ data }) => setTickets(data.data)).catch(() => setError('Failed to load tickets'))
  }, [teamId, type, epicId, q])

  useEffect(loadTickets, [loadTickets])

  async function onDrop(e: DragEvent, state: TicketState) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    const ticket = tickets.find((t) => t.id === id)
    if (!ticket || ticket.state === state) return
    const prev = ticket.state
    setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, state } : t)))
    setMoveError(null)
    try {
      const { data } = await ticketsApi.update(id, { state })
      setTickets((ts) => ts.map((t) => (t.id === id ? data.data : t)))
    } catch {
      setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, state: prev } : t)))
      setMoveError(`Could not move "${ticket.title}". Reverted.`)
    }
  }

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  if (loading) return <Loading />
  if (error) return <ErrorMessage>{error}</ErrorMessage>

  if (teams.length === 0) {
    return (
      <section data-testid="board-page">
        <h1>Board</h1>
        <p data-testid="board-no-teams">No teams yet — create one on the Teams screen.</p>
      </section>
    )
  }

  return (
    <section data-testid="board-page">
      <div className="board-toolbar">
        <label>
          Team:{' '}
          <select data-testid="board-team-select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <button className="btn-primary" data-testid="new-ticket-button" onClick={() => navigate(`/tickets/new?teamId=${teamId}`)}>
          + New ticket
        </button>
      </div>

      <div className="board-filters" data-testid="board-filters">
        <input data-testid="filter-search" type="search" placeholder="Search title…" value={q}
          onChange={(e) => setQ(e.target.value)} />
        <select data-testid="filter-type" value={type} onChange={(e) => setType(e.target.value as TicketType | '')}>
          <option value="">All types</option>
          {TICKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select data-testid="filter-epic" value={epicId} onChange={(e) => setEpicId(e.target.value)}>
          <option value="">All epics</option>
          {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
        </select>
        <button data-testid="filter-clear" onClick={clearFilters}>Clear</button>
        <span className="ticket-count" data-testid="ticket-count">{tickets.length} tickets</span>
      </div>

      {moveError && <ErrorMessage>{moveError}</ErrorMessage>}

      <div className="board" data-testid="kanban-board" style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        {TICKET_STATES.map((state) => {
          const inColumn = tickets.filter((t) => t.state === state)
          return (
            <section key={state} data-testid={`column-${state}`} className="board-column"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, state)}>
              <h2 className="column-header">
                {STATE_LABEL[state]}
                <span className="col-count" data-testid={`count-${state}`}>{inColumn.length}</span>
              </h2>
              <ul>
                {inColumn.map((t) => (
                  <li key={t.id} className="ticket-card" data-testid={`card-${t.id}`} draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => navigate(`/tickets/${t.id}`)}>
                    <span className={`badge type-${t.type}`}>{t.type}</span>
                    <div data-testid="card-title" className="card-title">{t.title}</div>
                    {t.epic && <small className="muted">Epic: {t.epic.title}</small>}
                    <div className="card-time muted">{relativeTime(t.modifiedAt)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </section>
  )
}
