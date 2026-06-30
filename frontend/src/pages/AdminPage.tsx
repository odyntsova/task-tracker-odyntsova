import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usersApi, authApi } from '@/services/api'
import type { User, UserRole } from '@/types'

const ROLES: UserRole[] = ['ADMIN', 'PM', 'DEVELOPER', 'QA', 'QA_AUTO']

export function AdminPage() {
  const [me, setMe] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([authApi.me(), usersApi.list()])
      .then(([meRes, usersRes]) => {
        setMe(meRes.data.data)
        setUsers(usersRes.data.data)
      })
      .catch(() => setError('Failed to load admin data'))
      .finally(() => setLoading(false))
  }, [])

  async function changeRole(id: string, role: UserRole) {
    const previous = users.find((u) => u.id === id)?.role
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
    try {
      await usersApi.updateRole(id, role)
    } catch {
      setError('Failed to update role')
      setUsers((prev) => prev.map((u) => (u.id === id && previous ? { ...u, role: previous } : u)))
    }
  }

  if (loading) return <p data-testid="loading">Loading…</p>

  // role gate — only ADMIN sees the panel
  if (me && me.role !== 'ADMIN') {
    return (
      <main data-testid="admin-page">
        <h1>Admin</h1>
        <p data-testid="admin-forbidden" role="alert">
          Access denied — admins only.
        </p>
        <Link to="/">← Back</Link>
      </main>
    )
  }

  return (
    <main data-testid="admin-page">
      <h1>Admin — user roles</h1>
      <p>
        <Link to="/">← Back to dashboard</Link>
      </p>
      {error && <p data-testid="admin-error" role="alert">{error}</p>}

      <table data-testid="admin-users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} data-testid={`admin-user-${u.id}`}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <select
                  data-testid={`role-select-${u.id}`}
                  value={u.role}
                  disabled={u.id === me?.id}
                  onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
