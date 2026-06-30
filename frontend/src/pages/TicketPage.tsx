import { useEffect, useState, FormEvent } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { teamsApi, epicsApi, ticketsApi } from '@/services/api'
import { Loading, ErrorMessage, SuccessMessage } from '@/components/AsyncState'
import { TICKET_TYPES, TICKET_STATES, STATE_LABEL } from '@/types'
import { isAxiosError } from 'axios'
import type { Team, Epic, Ticket, Comment, TicketType, TicketState } from '@/types'

export function TicketPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !id

  const [teams, setTeams] = useState<Team[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // form fields
  const [teamId, setTeamId] = useState('')
  const [type, setType] = useState<TicketType>('bug')
  const [state, setState] = useState<TicketState>('new')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [epicId, setEpicId] = useState('')

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentBody, setCommentBody] = useState('')

  // load on mount and whenever the route id changes (e.g. after create → details)
  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const t = (await teamsApi.list()).data.data
        setTeams(t)
        if (isNew) {
          setTeamId(params.get('teamId') || t[0]?.id || '')
        } else {
          const tk = (await ticketsApi.get(id!)).data.data
          setTicket(tk)
          setTeamId(tk.team.id)
          setType(tk.type)
          setState(tk.state)
          setTitle(tk.title)
          setBody(tk.body)
          setEpicId(tk.epic?.id ?? '')
          loadComments(id!)
        }
      } catch {
        setError('Failed to load ticket')
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // epics follow the selected team
  useEffect(() => {
    if (teamId) epicsApi.list(teamId).then(({ data }) => setEpics(data.data)).catch(() => {})
  }, [teamId])

  function onTeamChange(next: string) {
    setTeamId(next)
    setEpicId('') // a ticket's epic must belong to its team
  }

  function loadComments(ticketId: string) {
    ticketsApi.comments(ticketId).then(({ data }) => setComments(data.data)).catch(() => {})
  }

  const apiErr = (err: unknown, fb: string) =>
    (isAxiosError(err) && (err.response?.data as { error?: string })?.error) || fb

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaved(false)
    try {
      if (isNew) {
        const { data } = await ticketsApi.create({ teamId, type, title, body, epicId: epicId || null })
        navigate(`/tickets/${data.data.id}`)
      } else {
        const { data } = await ticketsApi.update(id!, { teamId, type, state, title, body, epicId: epicId || null })
        setTicket(data.data)
        setSaved(true)
      }
    } catch (err) {
      setSaveError(apiErr(err, 'Failed to save ticket'))
    }
  }

  async function remove() {
    if (!confirm('Delete this ticket and its comments?')) return
    try {
      await ticketsApi.remove(id!)
      navigate('/board')
    } catch (err) {
      setSaveError(apiErr(err, 'Failed to delete ticket'))
    }
  }

  async function addComment(e: FormEvent) {
    e.preventDefault()
    if (!commentBody.trim()) return
    try {
      const { data } = await ticketsApi.addComment(id!, commentBody.trim())
      setComments((c) => [...c, data.data])
      setCommentBody('')
    } catch {
      setSaveError('Failed to add comment')
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorMessage>{error}</ErrorMessage>

  return (
    <section data-testid="ticket-page">
      <p><Link to="/board">← Back to board</Link></p>
      <h1>{isNew ? 'New ticket' : 'Ticket details'}</h1>

      <form onSubmit={save} data-testid="ticket-form">
        <label>Team
          <select data-testid="ticket-team" value={teamId} onChange={(e) => onTeamChange(e.target.value)} required>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>Type
          <select data-testid="ticket-type" value={type} onChange={(e) => setType(e.target.value as TicketType)}>
            {TICKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {!isNew && (
          <label>State
            <select data-testid="ticket-state" value={state} onChange={(e) => setState(e.target.value as TicketState)}>
              {TICKET_STATES.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
            </select>
          </label>
        )}
        <label>Epic
          <select data-testid="ticket-epic" value={epicId} onChange={(e) => setEpicId(e.target.value)}>
            <option value="">(none)</option>
            {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
          </select>
        </label>
        <input data-testid="ticket-title" placeholder="Title" value={title}
          onChange={(e) => setTitle(e.target.value)} required />
        <textarea data-testid="ticket-body" placeholder="Body" value={body}
          onChange={(e) => setBody(e.target.value)} required rows={4} style={{ width: '100%' }} />
        {saveError && <ErrorMessage>{saveError}</ErrorMessage>}
        {saved && <SuccessMessage>Saved</SuccessMessage>}
        <button data-testid="ticket-save" type="submit">{isNew ? 'Create ticket' : 'Save'}</button>
        {!isNew && <button data-testid="ticket-delete" type="button" onClick={remove}>Delete</button>}
      </form>

      {!isNew && ticket && (
        <>
          <p className="muted" data-testid="ticket-meta">
            Created by {ticket.createdBy.email} · created {ticket.createdAt.slice(0, 19).replace('T', ' ')} UTC ·
            modified {ticket.modifiedAt.slice(0, 19).replace('T', ' ')} UTC
          </p>

          <section aria-label="Comments">
            <h2>Comments</h2>
            {comments.length === 0 ? (
              <p data-testid="comments-empty">No comments yet.</p>
            ) : (
              <ul data-testid="comments-list">
                {comments.map((c) => (
                  <li key={c.id} data-testid={`comment-${c.id}`}>
                    <strong>{c.author.email}</strong> · {c.createdAt.slice(0, 19).replace('T', ' ')}
                    <div>{c.body}</div>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addComment} data-testid="add-comment-form">
              <input data-testid="comment-input" placeholder="Add a comment…" value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)} required />
              <button data-testid="comment-submit" type="submit">Comment</button>
            </form>
          </section>
        </>
      )}
    </section>
  )
}
