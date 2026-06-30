import { useEffect, useState, useCallback, DragEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { tasksApi } from '@/services/api'
import { isAxiosError } from 'axios'
import type { Task, TaskStatus } from '@/types'

const COLUMNS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']

export function KanbanPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    tasksApi
      .list(projectId, { limit: 100 })
      .then(({ data }) => setTasks(data.data))
      .catch(() => setError('Failed to load board'))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(load, [load])

  function onDragStart(e: DragEvent, taskId: string) {
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  async function onDrop(e: DragEvent, status: TaskStatus) {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/plain')
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === status) return

    const previous = task.status
    // optimistic move
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
    setError(null)

    try {
      const { data } = await tasksApi.update(taskId, { status })
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data.data : t)))
    } catch (err) {
      // a 422 means the workflow forbids this transition (TASK-3) — revert
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: previous } : t)))
      if (isAxiosError(err) && err.response?.status === 422) {
        setError(`Cannot move "${task.title}" from ${previous} to ${status}: not allowed by the workflow`)
      } else {
        setError('Failed to move task')
      }
    }
  }

  if (loading) return <p data-testid="loading">Loading…</p>

  return (
    <main data-testid="kanban-page">
      <h1>Board</h1>
      <p>
        <Link data-testid="tasks-link" to={`/projects/${projectId}/tasks`}>
          ← Back to tasks
        </Link>
      </p>
      {error && (
        <p data-testid="kanban-error" role="alert">
          {error}
        </p>
      )}

      <div data-testid="kanban-board" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {COLUMNS.map((status) => {
          const columnTasks = tasks.filter((t) => t.status === status)
          return (
            <section
              key={status}
              data-testid={`kanban-column-${status}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, status)}
              style={{ flex: 1, minWidth: 160, border: '1px solid #ccc', padding: 8 }}
            >
              <h2>
                {status} <span data-testid={`kanban-count-${status}`}>({columnTasks.length})</span>
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, minHeight: 40 }}>
                {columnTasks.map((task) => (
                  <li
                    key={task.id}
                    data-testid={`kanban-card-${task.id}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, task.id)}
                    style={{ border: '1px solid #999', borderRadius: 4, padding: 6, marginBottom: 6, cursor: 'grab' }}
                  >
                    <span data-testid="kanban-card-title">{task.title}</span>{' '}
                    <small>{task.priority}</small>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </main>
  )
}
