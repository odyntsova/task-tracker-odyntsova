import { useEffect, useState, FormEvent } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { authApi } from '@/services/api'

type Status = 'idle' | 'verifying' | 'ok' | 'fail'

// Email-verification result screen. Accepts a token from ?token= or manual input.
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [token, setToken] = useState(params.get('token') ?? '')
  const [status, setStatus] = useState<Status>('idle')

  async function verify(t: string) {
    setStatus('verifying')
    try {
      await authApi.verifyEmail(t)
      setStatus('ok')
      // a successful verification leads the user to the login screen
      setTimeout(() => navigate('/login'), 1500)
    } catch {
      setStatus('fail')
    }
  }

  useEffect(() => {
    const t = params.get('token')
    if (t) verify(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    verify(token)
  }

  return (
    <main data-testid="verify-email-page">
      <h1>Email verification</h1>
      {status === 'ok' && (
        <p data-testid="verify-ok">Your email is verified — redirecting to login… <Link to="/login">Log in</Link>.</p>
      )}
      {status === 'fail' && (
        <p data-testid="verify-fail" className="error">
          Invalid or expired token. <Link to="/verify-needed">Request a new one</Link>.
        </p>
      )}
      {status !== 'ok' && (
        <form onSubmit={onSubmit} data-testid="verify-form">
          <input data-testid="token-input" placeholder="Verification token" value={token}
            onChange={(e) => setToken(e.target.value)} required />
          <button data-testid="verify-submit" type="submit" disabled={status === 'verifying'}>
            {status === 'verifying' ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      )}
    </main>
  )
}
