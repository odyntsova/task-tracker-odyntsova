import { useEffect, useState, useCallback, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { tasksApi, usersApi, sprintsApi, TaskListParams } from '@/services/api'
import type { Task, TaskStatus, TaskPriority, User, Sprint } from '@/types'

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']
const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export function TasksPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // filters
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('') // '', 'unassigned', or user id
  const [search, setSearch] = useState('')

  // create-task form
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<TaskPriority>('MEDIUM')
  const [creating, setCreating] = useState(false)

  const loadTasks = useCallback(() => {
    if (!projectId) return
    const params: TaskListParams = {}
    if (statusFilter) params.status = statusFilter
    if (priorityFilter) params.priority = priorityFilter
    if (assigneeFilter) params.assignee = assigneeFilter
    if (search.trim()) params.q = search.trim()

    setLoading(true)
    tasksApi
      .list(projectId, params)
      .then(({ data }) => setTasks(data.data))
      .catch(() => setError('Failed to load tasks'))
      .finally(() => setLoading(false))
  }, [projectId, statusFilter, priorityFilter, assigneeFilter, search])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  useEffect(() => {
    usersApi.list().then(({ data }) => setUsers(data.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) return
    sprintsApi.list(projectId).then(({ data }) => setSprints(data.data)).catch(() => {})
  }, [projectId])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!projectId) return
    setCreating(true)
    try {
      await tasksApi.create(projectId, { title: newTitle, description: null, priority: newPriority })
      setNewTitle('')
      setNewPriority('MEDIUM')
      loadTasks()
    } catch {
      setError('Failed to create task')
    } finally {
      setCreating(false)
    }
  }

  async function patchTask(taskId: string, data: Parameters<typeof tasksApi.update>[1]) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...data } as Task : t)))
    try {
      const { data: res } = await tasksApi.update(taskId, data)
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.data : t)))
    } catch {
      setError('Failed to update task')
      loadTasks() // revert to server truth
    }
  }

  return (
    <main data-testid="tasks-page">
      <h1>Tasks</h1>
      <p>
        <Link data-testid="sprints-link" to={`/projects/${projectId}/sprints`}>
          Manage sprints →
        </Link>
        {' · '}
        <Link data-testid="board-link" to={`/projects/${projectId}/board`}>
          Kanban board →
        </Link>
        {' · '}
        <Link data-testid="report-link" to={`/projects/${projectId}/report`}>
          Report →
        </Link>
      </p>

      <form onSubmit={handleCreate} data-testid="create-task-form">
        <input
          data-testid="new-task-title"
          type="text"
          placeholder="New task title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          required
        />
        <select
          data-testid="new-task-priority"
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button data-testid="create-task-submit" type="submit" disabled={creating}>
          {creating ? 'Adding…' : 'Add task'}
        </button>
      </form>

      <section data-testid="filters" aria-label="Filters">
        <input
          data-testid="filter-search"
          type="search"
          placeholder="Search title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          data-testid="filter-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          data-testid="filter-priority"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | '')}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          data-testid="filter-assignee"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
        >
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </section>

      {loading ? (
        <p data-testid="loading">Loading…</p>
      ) : error ? (
        <p data-testid="error" role="alert">{error}</p>
      ) : tasks.length === 0 ? (
        <p data-testid="empty-state">No tasks match the current filters.</p>
      ) : (
        <ul data-testid="tasks-list">
          {tasks.map((task) => (
            <li key={task.id} data-testid={`task-item-${task.id}`}>
              <Link data-testid={`task-link-${task.id}`} to={`/projects/${projectId}/tasks/${task.id}`}>
                {task.title}
              </Link>

              <select
                data-testid={`task-status-${task.id}`}
                value={task.status}
                onChange={(e) => patchTask(task.id, { status: e.target.value as TaskStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                data-testid={`task-priority-${task.id}`}
                value={task.priority}
                onChange={(e) => patchTask(task.id, { priority: e.target.value as TaskPriority })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              <select
                data-testid={`task-assignee-${task.id}`}
                value={task.assignee?.id ?? ''}
                onChange={(e) =>
                  patchTask(task.id, { assigneeId: e.target.value === '' ? null : e.target.value })
                }
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>

              <select
                data-testid={`task-sprint-${task.id}`}
                value={task.sprintId ?? ''}
                onChange={(e) =>
                  patchTask(task.id, { sprintId: e.target.value === '' ? null : e.target.value })
                }
              >
                <option value="">No sprint</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
