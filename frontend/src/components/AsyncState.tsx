// Shared loading / error UI so every page renders these states identically.
// Keeps the established data-testids ("loading" / "error") used by e2e.

export function Loading() {
  return <p data-testid="loading">Loading…</p>
}

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p data-testid="error" role="alert" className="error">
      {children}
    </p>
  )
}
