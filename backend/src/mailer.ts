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

/** Best-effort send — never throws into the caller's request flow. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    await transport.send(message)
  } catch (err) {
    console.error('[email] delivery failed:', (err as Error).message)
  }
}
