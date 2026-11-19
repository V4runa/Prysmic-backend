import { Logger } from '@nestjs/common';
import type { EmailProvider, OutboundEmail } from './email.types';

/** Development and test stand-in. Keeps the message so tests can read the link. */
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailProvider.name);
  readonly outbox: OutboundEmail[] = [];

  isConfigured(): boolean {
    return true;
  }

  send(message: OutboundEmail): Promise<void> {
    this.outbox.push(message);
    if (process.env.NODE_ENV === 'test') return Promise.resolve();
    const text =
      process.env.NODE_ENV === 'development'
        ? message.text
        : redactMailTokens(message.text);
    this.logger.log(`to=${message.to} subject=${message.subject}\n${text}`);
    return Promise.resolve();
  }

  clear(): void {
    this.outbox.length = 0;
  }
}

/** Hides verify and reset tokens in logged links. The outbox keeps the original. */
export function redactMailTokens(value: string): string {
  return value.replace(/([?&]token=)[^&\s"'<>]+/gi, '$1[redacted]');
}
