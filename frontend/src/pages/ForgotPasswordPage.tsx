import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/services/api'

// Requests a password-reset email. Like resend-verification, it confirms
// without revealing whether the address has an account.
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main data-testid="forgot-password-page">
      <h1>Forgot password</h1>
      {sent ? (
        <p data-testid="forgot-sent">
          If that address has an account, a password-reset email has been sent.{' '}
          <Link to="/reset-password">Enter reset token</Link>
        </p>
      ) : (
        <>
          <p>Enter your email and we’ll send you a reset link.</p>
          <form onSubmit={onSubmit} data-testid="forgot-form">
            <input data-testid="email-input" type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required />
            <button data-testid="forgot-submit" type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset email'}
            </button>
          </form>
        </>
      )}
      <p><Link to="/login">Back to login</Link></p>
    </main>
  )
}
