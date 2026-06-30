import { Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TasksPage } from '@/pages/TasksPage'
import { SprintsPage } from '@/pages/SprintsPage'
import { KanbanPage } from '@/pages/KanbanPage'
import { BurndownPage } from '@/pages/BurndownPage'

function isAuthenticated() {
  return !!localStorage.getItem('accessToken')
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <DashboardPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/projects/:projectId/tasks"
        element={
          <PrivateRoute>
            <TasksPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/projects/:projectId/sprints"
        element={
          <PrivateRoute>
            <SprintsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/projects/:projectId/board"
        element={
          <PrivateRoute>
            <KanbanPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/projects/:projectId/sprints/:sprintId/burndown"
        element={
          <PrivateRoute>
            <BurndownPage />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
