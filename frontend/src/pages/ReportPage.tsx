import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { projectsApi, ProjectReport } from '@/services/api'

const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']

export function ReportPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [report, setReport] = useState<ProjectReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    projectsApi
      .report(projectId)
      .then(({ data }) => setReport(data.data))
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return <p data-testid="loading">Loading…</p>
  if (error) return <p data-testid="error" role="alert">{error}</p>
  if (!report) return null

  const { tasks, velocity } = report
  const maxVelocity = Math.max(1, ...velocity.map((v) => v.completed))

  return (
    <main data-testid="report-page">
      <h1>Project report</h1>
      <p>
        <Link to={`/projects/${projectId}/tasks`}>← Back to tasks</Link>
      </p>

      <section aria-label="Task metrics">
        <h2>Tasks</h2>
        <p data-testid="report-total">Total: {tasks.total}</p>
        <p data-testid="report-completion">
          Completed: {tasks.completed} / {tasks.total} ({tasks.completionRate}%)
        </p>
        <table data-testid="report-status-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {STATUSES.map((s) => (
              <tr key={s}>
                <td>{s}</td>
                <td data-testid={`report-status-${s}`}>{tasks.byStatus[s] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label="Velocity">
        <h2>Velocity (completed per sprint)</h2>
        {velocity.length === 0 ? (
          <p data-testid="velocity-empty">No sprints yet.</p>
        ) : (
          <ul data-testid="velocity-list" style={{ listStyle: 'none', padding: 0 }}>
            {velocity.map((v) => (
              <li key={v.sprintId} data-testid={`velocity-${v.sprintId}`} style={{ marginBottom: 4 }}>
                <span>{v.name}: </span>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    height: 12,
                    width: `${(v.completed / maxVelocity) * 200}px`,
                    background: '#2563eb',
                    verticalAlign: 'middle',
                  }}
                />
                <strong> {v.completed}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
