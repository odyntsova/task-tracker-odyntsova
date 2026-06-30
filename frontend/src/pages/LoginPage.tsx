import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await login(email, password)
      navigate(user.emailVerified ? '/board' : '/verify-needed')
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main data-testid="login-page">
      <h1>Log in</h1>
      <form onSubmit={handleSubmit} data-testid="login-form">
        <input data-testid="email-input" type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <input data-testid="password-input" type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        {error && <p data-testid="login-error" role="alert" className="error">{error}</p>}
        <button data-testid="login-submit" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>No account? <Link to="/signup">Sign up</Link></p>
      <p>Forgot your password? <Link to="/forgot-password">Reset it</Link></p>
      <p>Need a new verification email? <Link to="/verify-needed">Resend</Link></p>
    </main>
  )
}
