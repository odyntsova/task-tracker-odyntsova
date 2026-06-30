import { sendEmail, setEmailTransport, isTransient, EmailMessage } from './mailer'

describe('mailer (NOTIF-3)', () => {
  it('delegates to the configured transport', async () => {
    const sent: EmailMessage[] = []
    setEmailTransport({ async send(m) { sent.push(m) } })

    await sendEmail({ to: 'a@e.com', subject: 'Hi', text: 'Body' })

    expect(sent).toEqual([{ to: 'a@e.com', subject: 'Hi', text: 'Body' }])
  })

  it('is best-effort: a throwing transport does not propagate', async () => {
    setEmailTransport({
      async send() {
        throw new Error('SMTP down')
      },
    })

    await expect(sendEmail({ to: 'a@e.com', subject: 'X', text: 'Y' })).resolves.toBeUndefined()
  })

  describe('isTransient (retry classification)', () => {
    it('retries SMTP 4xx deferrals (e.g. 451 greylisting)', () => {
      expect(isTransient({ responseCode: 451 })).toBe(true)
      expect(isTransient({ responseCode: 421 })).toBe(true)
    })

    it('does NOT retry SMTP 5xx hard rejections (e.g. 550 spoofing block)', () => {
      expect(isTransient({ responseCode: 550 })).toBe(false)
      expect(isTransient({ responseCode: 500 })).toBe(false)
    })

    it('retries connection-level network errors', () => {
      expect(isTransient({ code: 'ETIMEDOUT' })).toBe(true)
      expect(isTransient({ code: 'ECONNRESET' })).toBe(true)
    })

    it('does NOT retry an unclassified error', () => {
      expect(isTransient(new Error('SMTP down'))).toBe(false)
      expect(isTransient({ code: 'NOPE' })).toBe(false)
    })
  })
})
