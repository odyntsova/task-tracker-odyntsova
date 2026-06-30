import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi, setTokens } from '@/services/api'
import { isAxiosError } from 'axios'

export function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data } = await authApi.register(name, email, password)
      setTokens(data.data.tokens)
      navigate('/')
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setError('This email is already registered')
      } else if (isAxiosError(err) && err.response?.status === 422) {
        setError('Check your input — password must be at least 8 characters')
      } else {
        setError('Registration failed, please try again')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main data-testid="register-page">
      <h1>Create account</h1>
      <form onSubmit={handleSubmit} data-testid="register-form">
        <div>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            data-testid="name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            data-testid="email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            data-testid="password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        {error && (
          <p data-testid="register-error" role="alert">
            {error}
          </p>
        )}
        <button data-testid="register-submit" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  )
}
