import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Layout } from '@/components/Layout'
import { Loading } from '@/components/AsyncState'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { VerifyEmailPage } from '@/pages/VerifyEmailPage'
import { VerifyNeededPage } from '@/pages/VerifyNeededPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { BoardPage } from '@/pages/BoardPage'
import { TeamsPage } from '@/pages/TeamsPage'
import { EpicsPage } from '@/pages/EpicsPage'
import { TicketPage } from '@/pages/TicketPage'

// Authenticated + verified pages render inside the app shell.
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (!localStorage.getItem('accessToken')) return <Navigate to="/login" replace />
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!user.emailVerified) return <Navigate to="/verify-needed" replace />
  return <Layout>{children}</Layout>
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/verify-needed" element={<VerifyNeededPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/board" element={<Protected><BoardPage /></Protected>} />
      <Route path="/teams" element={<Protected><TeamsPage /></Protected>} />
      <Route path="/epics" element={<Protected><EpicsPage /></Protected>} />
      <Route path="/tickets/new" element={<Protected><TicketPage /></Protected>} />
      <Route path="/tickets/:id" element={<Protected><TicketPage /></Protected>} />

      <Route path="*" element={<Navigate to="/board" replace />} />
    </Routes>
  )
}
