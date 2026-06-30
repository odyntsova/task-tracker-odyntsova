import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { sprintsApi, BurndownData } from '@/services/api'
import { Loading, ErrorMessage } from '@/components/AsyncState'

const W = 480
const H = 240
const PAD = 32

function line(points: number[], total: number, count: number): string {
  if (count <= 1) return ''
  return points
    .map((v, i) => {
      const x = PAD + (i * (W - 2 * PAD)) / (count - 1)
      const y = H - PAD - (total === 0 ? 0 : (v / total) * (H - 2 * PAD))
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function BurndownPage() {
  const { projectId, sprintId } = useParams<{ projectId: string; sprintId: string }>()
  const [data, setData] = useState<BurndownData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sprintId) return
    sprintsApi
      .burndown(sprintId)
      .then(({ data }) => setData(data.data))
      .catch(() => setError('Failed to load burndown'))
      .finally(() => setLoading(false))
  }, [sprintId])

  if (loading) return <Loading />
  if (error) return <ErrorMessage>{error}</ErrorMessage>
  if (!data) return null

  const { total, points } = data
  const idealLine = line(points.map((p) => p.ideal), total, points.length)
  const remainingLine = line(points.map((p) => p.remaining), total, points.length)

  return (
    <main data-testid="burndown-page">
      <h1>Burndown</h1>
      <p>
        <Link to={`/projects/${projectId}/sprints`}>← Back to sprints</Link>
      </p>
      <p data-testid="burndown-total">Total tasks: {total}</p>

      {total === 0 ? (
        <p data-testid="empty-state">No tasks in this sprint yet.</p>
      ) : (
        <>
          <svg data-testid="burndown-chart" width={W} height={H} role="img" aria-label="Burndown chart">
            {/* axes */}
            <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#999" />
            <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#999" />
            {/* ideal (dashed) vs actual remaining */}
            <polyline points={idealLine} fill="none" stroke="#888" strokeDasharray="4 4" />
            <polyline points={remainingLine} fill="none" stroke="#2563eb" strokeWidth="2" />
          </svg>

          {/* accessible data table (also used by e2e) */}
          <table data-testid="burndown-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Ideal</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} data-testid={`burndown-row-${p.date}`}>
                  <td>{p.date}</td>
                  <td>{p.ideal}</td>
                  <td data-testid={`burndown-remaining-${p.date}`}>{p.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
