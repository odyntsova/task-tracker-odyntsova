import nodemailer, { Transporter } from 'nodemailer'

// Email delivery. Uses a real SMTP transport when SMTP_HOST is configured
// (the spec requires supporting relay1.dataart.com); otherwise falls back to a
// console transport for local dev / tests. Secrets come from env, never source.

export interface EmailMessage {
  to: string
  subject: string
  text: string
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>
}

const consoleTransport: EmailTransport = {
  async send({ to, subject, text }) {
    // Dev convenience: print the body (which carries verification/reset tokens)
    // so QA can complete flows without a real mailbox. Never used in test/prod SMTP.
    if (process.env.NODE_ENV !== 'test') console.log(`[email] → ${to} | ${subject}\n        ${text}`)
  },
}

function smtpTransport(): EmailTransport {
  const transporter: Transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 25),
    secure: process.env.SMTP_SECURE === 'true',
    // Stable EHLO/HELO name. In Docker the default is the container id, which
    // some relays (incl. DataArt's) treat as an untrusted greylisting key.
    name: process.env.SMTP_HELO ?? 'ticket-tracker.local',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
  const from = process.env.MAIL_FROM ?? 'no-reply@ticket-tracker.local'
  return {
    async send({ to, subject, text }) {
      await transporter.sendMail({ from, to, subject, text })
    },
  }
}

let transport: EmailTransport = process.env.SMTP_HOST ? smtpTransport() : consoleTransport

/** Override the transport (used by tests). */
export function setEmailTransport(next: EmailTransport): void {
  transport = next
}

// Backoff schedule for transient failures. Spans ~18 min so it rides out the
// relay's greylisting window (a first send is often deferred with a 4xx).
const RETRY_DELAYS_MS = [60_000, 180_000, 300_000, 600_000]

const TRANSIENT_NET_CODES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND', 'ESOCKET', 'EAI_AGAIN',
])

// A failure is worth retrying when the relay deferred us (SMTP 4xx, e.g. 451
// greylisting) or the connection itself faltered. A 5xx (e.g. 550) is a hard
// rejection — retrying would only repeat it.
export function isTransient(err: unknown): boolean {
  const e = err as { responseCode?: number; code?: string }
  if (typeof e?.responseCode === 'number') return e.responseCode >= 400 && e.responseCode < 500
  return typeof e?.code === 'string' && TRANSIENT_NET_CODES.has(e.code)
}

async function attempt(message: EmailMessage, n: number): Promise<void> {
  try {
    await transport.send(message)
    if (n > 0) console.log(`[email] delivered to ${message.to} on retry ${n}`)
  } catch (err) {
    const e = err as Error
    // Retries run in the background (the request flow has already returned) and
    // are skipped in tests to avoid leaking timers.
    const canRetry =
      isTransient(err) && n < RETRY_DELAYS_MS.length && process.env.NODE_ENV !== 'test'
    const note = canRetry ? ` — retrying in ${RETRY_DELAYS_MS[n] / 1000}s` : ''
    console.error(`[email] attempt ${n + 1} to ${message.to} failed: ${e.message}${note}`)
    if (canRetry) {
      const timer = setTimeout(() => void attempt(message, n + 1), RETRY_DELAYS_MS[n])
      if (typeof timer.unref === 'function') timer.unref()
    }
  }
}

/**
 * Best-effort send — never throws and never blocks the caller's request flow.
 * Delivery (and any backoff retries on transient failures like greylisting or
 * connection blips) runs in the background; the endpoints return 200 regardless
 * of delivery, so there's nothing for the request to wait on.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  void attempt(message, 0)
}
