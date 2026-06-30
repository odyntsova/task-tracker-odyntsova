import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { projectsApi, authApi, clearTokens } from '@/services/api'
import type { Project } from '@/types'

export function DashboardPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    projectsApi
      .list()
      .then(({ data }) => setProjects(data.data))
      .catch(() => setError('Failed to load projects'))
      .finally(() => setLoading(false))
  }, [])

  async function handleLogout() {
    try {
      await authApi.logout(localStorage.getItem('refreshToken'))
    } catch {
      // ignore — we clear locally regardless
    }
    clearTokens()
    navigate('/login')
  }

  if (loading) return <p data-testid="loading">Loading…</p>
  if (error) return <p data-testid="error" role="alert">{error}</p>

  return (
    <main data-testid="dashboard-page">
      <h1>Projects</h1>
      <button data-testid="logout-button" onClick={handleLogout}>
        Log out
      </button>
      {projects.length === 0 ? (
        <p data-testid="empty-state">No projects yet.</p>
      ) : (
        <ul data-testid="projects-list">
          {projects.map((project) => (
            <li key={project.id} data-testid={`project-item-${project.id}`}>
              <Link to={`/projects/${project.id}/tasks`}>{project.name}</Link>
              {project.description && <p>{project.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
