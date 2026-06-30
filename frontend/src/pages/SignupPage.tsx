import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/services/api'
import { isAxiosError } from 'axios'

export function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authApi.signup(email, password)
      setDone(true)
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) setError('This email is already registered')
      else if (isAxiosError(err) && err.response?.status === 422)
        setError('Password must be at least 8 characters')
      else setError('Sign-up failed, please try again')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <main data-testid="signup-done">
        <h1>Check your email</h1>
        <p>We sent a verification link to <strong>{email}</strong>. Verify it, then log in.</p>
        <p><Link to="/login">Go to login</Link></p>
      </main>
    )
  }

  return (
    <main data-testid="signup-page">
      <h1>Create account</h1>
      <form onSubmit={handleSubmit} data-testid="signup-form">
        <input data-testid="email-input" type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <input data-testid="password-input" type="password" placeholder="Password (min 8)" value={password}
          onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        {error && <p data-testid="signup-error" role="alert" className="error">{error}</p>}
        <button data-testid="signup-submit" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p>Already have an account? <Link to="/login">Log in</Link></p>
    </main>
  )
}
