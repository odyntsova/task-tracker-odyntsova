import { sendEmail, setEmailTransport, EmailMessage } from './mailer'

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
})
