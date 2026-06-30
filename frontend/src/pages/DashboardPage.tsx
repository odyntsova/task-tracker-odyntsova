import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { projectsApi, notificationsApi } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { Loading, ErrorMessage } from '@/components/AsyncState'
import type { Project, Notification } from '@/types'

export function DashboardPage() {
  const navigate = useNavigate()
  const { isAdmin, logout } = useAuth()
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
    await logout()
    navigate('/login')
  }

  if (loading) return <Loading />
  if (error) return <ErrorMessage>{error}</ErrorMessage>

  return (
    <main data-testid="dashboard-page">
      <h1>Projects</h1>
      <button data-testid="logout-button" onClick={handleLogout}>
        Log out
      </button>
      {isAdmin && (
        <p>
          <Link data-testid="admin-link" to="/admin">
            Admin panel →
          </Link>
        </p>
      )}

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
