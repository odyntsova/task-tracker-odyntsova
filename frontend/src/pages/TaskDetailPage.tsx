import { useEffect, useState, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { tasksApi, TaskActivity } from '@/services/api'
import type { Task, Comment } from '@/types'

export function TaskDetailPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>()
  const [task, setTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<TaskActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  function loadComments() {
    if (!taskId) return
    tasksApi.comments(taskId).then(({ data }) => setComments(data.data)).catch(() => {})
  }

  useEffect(() => {
    if (!taskId) return
    tasksApi
      .get(taskId)
      .then(({ data }) => setTask(data.data))
      .catch(() => setError('Failed to load task'))
      .finally(() => setLoading(false))
    loadComments()
    tasksApi.activity(taskId).then(({ data }) => setActivity(data.data)).catch(() => {})
  }, [taskId])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!taskId || !body.trim()) return
    setPosting(true)
    try {
      const { data } = await tasksApi.addComment(taskId, body.trim())
      setComments((prev) => [...prev, data.data])
      setBody('')
    } catch {
      setError('Failed to add comment')
    } finally {
      setPosting(false)
    }
  }

  if (loading) return <p data-testid="loading">Loading…</p>
  if (error) return <p data-testid="error" role="alert">{error}</p>
  if (!task) return null

  return (
    <main data-testid="task-detail-page">
      <p>
        <Link to={`/projects/${projectId}/tasks`}>← Back to tasks</Link>
      </p>
      <h1 data-testid="task-detail-title">{task.title}</h1>
      <p>
        <span data-testid="task-detail-status">{task.status}</span> ·{' '}
        <span data-testid="task-detail-priority">{task.priority}</span>
      </p>

      <section aria-label="Comments">
        <h2>Comments</h2>
        {comments.length === 0 ? (
          <p data-testid="comments-empty">No comments yet.</p>
        ) : (
          <ul data-testid="comments-list">
            {comments.map((c) => (
              <li key={c.id} data-testid={`comment-${c.id}`}>
                <strong>{c.author.name}:</strong> <span>{c.body}</span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} data-testid="add-comment-form">
          <input
            data-testid="comment-input"
            type="text"
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          <button data-testid="comment-submit" type="submit" disabled={posting}>
            {posting ? 'Posting…' : 'Comment'}
          </button>
        </form>
      </section>

      <section aria-label="Activity">
        <h2>Activity</h2>
        {activity.length === 0 ? (
          <p data-testid="activity-empty">No changes yet.</p>
        ) : (
          <ul data-testid="activity-list">
            {activity.map((a) => (
              <li key={a.id} data-testid={`activity-${a.id}`}>
                <strong>{a.user.name}</strong> changed <em>{a.field}</em>{' '}
                {a.oldValue ?? '∅'} → {a.newValue ?? '∅'}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
