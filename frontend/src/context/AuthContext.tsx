import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authApi, setTokens, clearTokens } from '@/services/api'
import type { User } from '@/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  refresh: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  function refresh() {
    if (!localStorage.getItem('accessToken')) {
      setUser(null)
      setLoading(false)
      return
    }
    setLoading(true)
    authApi
      .me()
      .then(({ data }) => setUser(data.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function login(email: string, password: string) {
    const { data } = await authApi.login(email, password)
    setTokens(data.data.tokens)
    setUser(data.data.user)
    return data.data.user
  }

  async function logout() {
    try {
      await authApi.logout(localStorage.getItem('refreshToken'))
    } catch {
      /* clear locally regardless */
    }
    clearTokens()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
