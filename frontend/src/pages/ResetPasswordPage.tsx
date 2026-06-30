import { useState, FormEvent } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { authApi } from '@/services/api'
import { isAxiosError } from 'axios'

type Status = 'idle' | 'submitting' | 'ok' | 'fail'

// Completes a password reset: a token (from ?token= or typed) plus a new
// password. On success it routes the user to login.
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [token, setToken] = useState(params.get('token') ?? '')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setError(null)
    try {
      await authApi.resetPassword(token, password)
      setStatus('ok')
      setTimeout(() => navigate('/login'), 1500)
    } catch (err) {
      setStatus('fail')
      setError(
        (isAxiosError(err) && (err.response?.data as { error?: string })?.error) ||
          'Could not reset the password'
      )
    }
  }

  return (
    <main data-testid="reset-password-page">
      <h1>Reset password</h1>
      {status === 'ok' ? (
        <p data-testid="reset-ok">Your password has been reset — redirecting to login… <Link to="/login">Log in</Link>.</p>
      ) : (
        <form onSubmit={onSubmit} data-testid="reset-form">
          <input data-testid="reset-token-input" placeholder="Reset token" value={token}
            onChange={(e) => setToken(e.target.value)} required />
          <input data-testid="reset-password-input" type="password" placeholder="New password (min 8 chars)"
            value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          {status === 'fail' && <p data-testid="reset-error" role="alert" className="error">{error}</p>}
          <button data-testid="reset-submit" type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      )}
      <p><Link to="/forgot-password">Request a new reset email</Link></p>
    </main>
  )
}
