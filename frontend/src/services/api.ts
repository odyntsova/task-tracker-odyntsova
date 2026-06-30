import axios from 'axios'
import type { ApiResponse, AuthTokens, User, Task, TaskStatus, TaskPriority, Project, Sprint } from '@/types'

const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (error) => {
    // A 401 from the auth endpoints themselves is a failed login/registration
    // attempt — let the form display the error instead of force-redirecting.
    const url: string = error.config?.url ?? ''
    const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/register')

    if (error.response?.status === 401 && !isAuthAttempt) {
      // Session expired / token rejected on a protected request → bounce to login.
      localStorage.removeItem('accessToken')
      window.location.href = '/login'
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

  logout: () => http.post('/auth/logout'),

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
