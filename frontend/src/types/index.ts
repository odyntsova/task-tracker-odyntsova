export type UserRole = 'ADMIN' | 'DEVELOPER' | 'QA' | 'QA_AUTO' | 'PM'

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  createdAt: string
}

export interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee: User | null
  projectId: string
  sprintId: string | null
  createdAt: string
  updatedAt: string
}

export interface Sprint {
  id: string
  name: string
  startDate: string
  endDate: string
  projectId: string
}

export type NotificationType = 'TASK_ASSIGNED' | 'TASK_STATUS_CHANGED'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  taskId: string | null
  readAt: string | null
  createdAt: string
}

export interface ApiResponse<T> {
  data: T
  error: string | null
  meta?: {
    page: number
    limit: number
    total: number
  }
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}
