import { ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

// App shell with the header nav (Board / Teams / Epics) + collapsed user menu.
export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <>
      <header data-testid="app-header" className="app-header">
        <strong>TICKET TRACKER</strong>
        <nav>
          <Link to="/board">Board</Link>
          <Link to="/teams">Teams</Link>
          <Link to="/epics">Epics</Link>
        </nav>
        <div className="user-menu">
          <button data-testid="user-menu-button" onClick={() => setMenuOpen((o) => !o)}>
            {user?.email ?? 'account'} ▾
          </button>
          {menuOpen && (
            <div className="user-menu-dropdown">
              <button data-testid="logout-button" onClick={handleLogout}>
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main>{children}</main>
    </>
  )
}
