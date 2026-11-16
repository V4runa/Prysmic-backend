import type { EmailFetch, EmailProvider, OutboundEmail } from './email.types';

const RESEND_URL = 'https://api.resend.com/emails';

/** Inbox that receives replies. The sending domain does not accept mail. */
export const DEFAULT_EMAIL_REPLY_TO = 'hello@prysmic.me';

export function resolveEmailReplyTo(configured?: string): string {
  const trimmed = configured?.trim();
  return trimmed ? trimmed : DEFAULT_EMAIL_REPLY_TO;
}

/**
 * Production sender. Construction never throws: a missing key is reported
 * when a caller actually tries to send, so boot stays up before secrets exist.
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly fetchImpl: EmailFetch;
  private readonly replyTo: string;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly from: string | undefined,
    fetchImpl?: EmailFetch,
    replyTo?: string,
  ) {
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
    this.replyTo = resolveEmailReplyTo(replyTo);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim() && this.from?.trim());
  }

  async send(message: OutboundEmail): Promise<void> {
    if (!this.isConfigured() || !this.apiKey || !this.from) {
      throw new Error('Email provider is not configured');
    }
    const replyTo = this.replyTo;
    if (
      hasHeaderBreak(this.from) ||
      hasHeaderBreak(message.to) ||
      hasHeaderBreak(replyTo)
    ) {
      throw new Error('Email send failed (invalid address)');
    }
    const response = await this.fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from.trim(),
        to: [message.to],
        reply_to: replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Status only. The response body can echo the recipient or the key.
      throw new Error(`Email send failed (${response.status})`);
    }
  }
}

function hasHeaderBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}
