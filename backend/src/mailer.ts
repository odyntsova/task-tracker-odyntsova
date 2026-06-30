// Pluggable email delivery (NOTIF-3).
//
// The app talks to an EmailTransport interface, not a concrete provider, so the
// transport can be swapped per environment:
//   - dev/test: a console transport (logs; no network)
//   - production: a real SMTP/SendGrid transport injected at startup via
//     setEmailTransport(...) — no application code needs to change.

export interface EmailMessage {
  to: string
  subject: string
  text: string
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>
}

const consoleTransport: EmailTransport = {
  async send({ to, subject }) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[email] → ${to} | ${subject}`)
    }
  },
}

let transport: EmailTransport = consoleTransport

/** Swap the transport (e.g. inject SMTP in production, or a spy in tests). */
export function setEmailTransport(next: EmailTransport): void {
  transport = next
}

/** Best-effort send — never throws into the caller's request flow. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    await transport.send(message)
  } catch (err) {
    console.error('[email] delivery failed:', (err as Error).message)
  }
}
