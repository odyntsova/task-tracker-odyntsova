import axios from 'axios'
import type {
  ApiResponse,
  AuthTokens,
  User,
  Team,
  Epic,
  Ticket,
  Comment,
  TicketType,
  TicketState,
} from '@/types'

const http = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json' } })

export function setTokens(t: AuthTokens) {
  localStorage.setItem('accessToken', t.accessToken)
  localStorage.setItem('refreshToken', t.refreshToken)
}
export function clearTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}
function redirectToLogin() {
  clearTokens()
  if (window.location.pathname !== '/login') window.location.href = '/login'
}

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Transparent access-token refresh on 401 (single-flight).
let refreshPromise: Promise<string> | null = null
async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) throw new Error('no refresh token')
  const { data } = await axios.post<ApiResponse<{ tokens: AuthTokens }>>('/api/auth/refresh', { refreshToken })
  setTokens(data.data.tokens)
  return data.data.tokens.accessToken
}

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const url: string = original?.url ?? ''
    const isAuthRoute = url.includes('/auth/')
    if (status === 401 && !isAuthRoute && !original?._retry) {
      original._retry = true
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken()
        const newToken = await refreshPromise
        refreshPromise = null
        original.headers.Authorization = `Bearer ${newToken}`
        return http(original)
      } catch {
        refreshPromise = null
        redirectToLogin()
        return Promise.reject(error)
      }
    }
    if (status === 401 && !isAuthRoute) redirectToLogin()
    return Promise.reject(error)
  }
)

export const authApi = {
  signup: (email: string, password: string) =>
    http.post<ApiResponse<{ id: string; email: string }>>('/auth/signup', { email, password }),
  login: (email: string, password: string) =>
    http.post<ApiResponse<{ user: User; tokens: AuthTokens }>>('/auth/login', { email, password }),
  me: () => http.get<ApiResponse<User>>('/auth/me'),
  logout: (refreshToken: string | null) => http.post('/auth/logout', { refreshToken }),
  verifyEmail: (token: string) => http.post('/auth/verify-email', { token }),
  resendVerification: (email: string) => http.post('/auth/resend-verification', { email }),
}

export const teamsApi = {
  list: () => http.get<ApiResponse<Team[]>>('/teams'),
  create: (name: string) => http.post<ApiResponse<Team>>('/teams', { name }),
  rename: (id: string, name: string) => http.patch<ApiResponse<Team>>(`/teams/${id}`, { name }),
  remove: (id: string) => http.delete(`/teams/${id}`),
}

export const epicsApi = {
  list: (teamId?: string) =>
    http.get<ApiResponse<Epic[]>>('/epics', { params: teamId ? { teamId } : {} }),
  create: (teamId: string, title: string, description?: string | null) =>
    http.post<ApiResponse<Epic>>('/epics', { teamId, title, description }),
  update: (id: string, data: { title?: string; description?: string | null }) =>
    http.patch<ApiResponse<Epic>>(`/epics/${id}`, data),
  remove: (id: string) => http.delete(`/epics/${id}`),
}

export interface TicketFilters {
  type?: TicketType
  epicId?: string
  q?: string
}
export interface TicketInput {
  teamId: string
  type: TicketType
  title: string
  body: string
  epicId?: string | null
  state?: TicketState
}

export const ticketsApi = {
  list: (teamId: string, filters?: TicketFilters) =>
    http.get<ApiResponse<Ticket[]>>('/tickets', { params: { teamId, ...filters } }),
  get: (id: string) => http.get<ApiResponse<Ticket>>(`/tickets/${id}`),
  create: (data: TicketInput) => http.post<ApiResponse<Ticket>>('/tickets', data),
  update: (id: string, data: Partial<TicketInput>) => http.patch<ApiResponse<Ticket>>(`/tickets/${id}`, data),
  remove: (id: string) => http.delete(`/tickets/${id}`),
  comments: (id: string) => http.get<ApiResponse<Comment[]>>(`/tickets/${id}/comments`),
  addComment: (id: string, body: string) => http.post<ApiResponse<Comment>>(`/tickets/${id}/comments`, { body }),
}
