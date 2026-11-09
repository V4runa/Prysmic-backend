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
    if (process.env.NODE_ENV !== 'test') {
      this.logger.log(
        `to=${message.to} subject=${message.subject}\n${message.text}`,
      );
    }
    return Promise.resolve();
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
