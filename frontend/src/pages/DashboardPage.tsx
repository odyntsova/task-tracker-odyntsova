import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { projectsApi, authApi, notificationsApi, clearTokens } from '@/services/api'
import type { Project, Notification } from '@/types'

export function DashboardPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    projectsApi
      .list()
      .then(({ data }) => setProjects(data.data))
      .catch(() => setError('Failed to load projects'))
      .finally(() => setLoading(false))
  }, [])

  function loadNotifications() {
    notificationsApi.list().then(({ data }) => setNotifications(data.data)).catch(() => {})
  }
  useEffect(loadNotifications, [])

  const unreadCount = notifications.filter((n) => !n.readAt).length

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)))
    try {
      await notificationsApi.markRead(id)
    } catch {
      loadNotifications()
    }
  }

  async function markAllRead() {
    const now = new Date().toISOString()
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })))
    try {
      await notificationsApi.markAllRead()
    } catch {
      loadNotifications()
    }
  }

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

      <section data-testid="notifications" aria-label="Notifications">
        <h2>
          Notifications <span data-testid="notifications-unread">({unreadCount})</span>
        </h2>
        {notifications.length > 0 && (
          <button data-testid="mark-all-read" onClick={markAllRead} disabled={unreadCount === 0}>
            Mark all read
          </button>
        )}
        {notifications.length === 0 ? (
          <p data-testid="notifications-empty">No notifications.</p>
        ) : (
          <ul data-testid="notifications-list">
            {notifications.map((n) => (
              <li key={n.id} data-testid={`notification-${n.id}`} data-read={n.readAt ? 'true' : 'false'}>
                <span>{n.message}</span>
                {!n.readAt && (
                  <button data-testid={`mark-read-${n.id}`} onClick={() => markRead(n.id)}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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
