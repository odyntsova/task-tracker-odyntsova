import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/services/api'

// Resend-verification screen for unverified or expired-token cases.
export function VerifyNeededPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.resendVerification(email)
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main data-testid="verify-needed-page">
      <h1>Verify your email</h1>
      <p>Your account must be verified before you can use the app.</p>
      {sent ? (
        <p data-testid="resend-sent">
          If that address has an unverified account, a new verification email has been sent.{' '}
          <Link to="/verify-email">Enter token</Link>
        </p>
      ) : (
        <form onSubmit={onSubmit} data-testid="resend-form">
          <input data-testid="email-input" type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
          <button data-testid="resend-submit" type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Resend verification email'}
          </button>
        </form>
      )}
      <p><Link to="/login">Back to login</Link></p>
    </main>
  )
}
