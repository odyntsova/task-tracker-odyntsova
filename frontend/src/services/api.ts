import axios from 'axios'
import type { ApiResponse, AuthTokens, User, Task, TaskStatus, TaskPriority, Project, Sprint } from '@/types'

const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// --- Token storage helpers ----------------------------------------------
export function setTokens(tokens: AuthTokens) {
  localStorage.setItem('accessToken', tokens.accessToken)
  localStorage.setItem('refreshToken', tokens.refreshToken)
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

// --- Transparent access-token refresh (AUTH-3 client side) ---------------
// On a 401 from a protected request, exchange the stored refresh token for a
// new access token (single-flight) and retry the original request once. If the
// refresh itself fails, clear tokens and bounce to /login.
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) throw new Error('no refresh token')
  // bare axios → bypass these interceptors (avoid recursion / stale auth header)
  const { data } = await axios.post<ApiResponse<{ tokens: AuthTokens }>>('/api/auth/refresh', {
    refreshToken,
  })
  setTokens(data.data.tokens)
  return data.data.tokens.accessToken
}

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const url: string = original?.url ?? ''
    const isAuthRoute =
      url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')

    if (status === 401 && !isAuthRoute && !original?._retry) {
      original._retry = true
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken()
        const newToken = await refreshPromise
        refreshPromise = null
        original.headers.Authorization = `Bearer ${newToken}`
        return http(original) // retry the original request transparently
      } catch {
        refreshPromise = null
        redirectToLogin()
        return Promise.reject(error)
      }
    }

    if (status === 401 && !isAuthRoute) {
      redirectToLogin()
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  login: (email: string, password: string) =>
    http.post<ApiResponse<{ user: User; tokens: AuthTokens }>>('/auth/login', { email, password }),

  register: (name: string, email: string, password: string) =>
    http.post<ApiResponse<{ user: User; tokens: AuthTokens }>>('/auth/register', {
      name,
      email,
      password,
    }),

  logout: (refreshToken: string | null) => http.post('/auth/logout', { refreshToken }),

  me: () => http.get<ApiResponse<User>>('/auth/me'),
}

export interface TaskListParams {
  page?: number
  limit?: number
  status?: TaskStatus
  priority?: TaskPriority
  assignee?: string // user id, or "unassigned"
  q?: string
  sortBy?: 'createdAt' | 'title' | 'status'
  order?: 'asc' | 'desc'
}

export interface TaskUpdate {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId?: string | null
  sprintId?: string | null
}

export const tasksApi = {
  list: (projectId: string, params?: TaskListParams) =>
    http.get<ApiResponse<Task[]>>(`/projects/${projectId}/tasks`, { params }),

  get: (id: string) => http.get<ApiResponse<Task>>(`/tasks/${id}`),

  create: (projectId: string, data: Pick<Task, 'title' | 'description' | 'priority'>) =>
    http.post<ApiResponse<Task>>(`/projects/${projectId}/tasks`, data),

  update: (id: string, data: TaskUpdate) => http.patch<ApiResponse<Task>>(`/tasks/${id}`, data),

  delete: (id: string) => http.delete(`/tasks/${id}`),
}

export const usersApi = {
  list: () => http.get<ApiResponse<User[]>>('/users'),
}

export const projectsApi = {
  list: () => http.get<ApiResponse<Project[]>>('/projects'),

  get: (id: string) => http.get<ApiResponse<Project>>(`/projects/${id}`),

  create: (data: Pick<Project, 'name' | 'description'>) =>
    http.post<ApiResponse<Project>>('/projects', data),
}

export const sprintsApi = {
  list: (projectId: string) =>
    http.get<ApiResponse<Sprint[]>>(`/projects/${projectId}/sprints`),

  get: (id: string) => http.get<ApiResponse<Sprint & { tasks: Task[] }>>(`/sprints/${id}`),

  create: (projectId: string, data: { name: string; startDate: string; endDate: string }) =>
    http.post<ApiResponse<Sprint>>(`/projects/${projectId}/sprints`, data),
}
