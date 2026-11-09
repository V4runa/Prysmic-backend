import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_UNAVAILABLE } from '../account.constants';
import { EMAIL_PROVIDER } from './email.provider.factory';
import type { EmailProvider, OutboundEmail } from './email.types';

@Injectable()
export class EmailDelivery {
  private readonly logger = new Logger(EmailDelivery.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  assertReady(): void {
    if (!this.isReady()) {
      throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
    }
  }

  isReady(): boolean {
    if (!this.provider.isConfigured()) return false;
    try {
      this.appUrl();
      return true;
    } catch {
      return false;
    }
  }

  /** True when a provider can accept mail. A notice does not need APP_URL. */
  canSend(): boolean {
    return this.provider.isConfigured();
  }

  /**
   * Sends when a provider is configured and does nothing when it is not.
   * Use this for mail that has no link. A failed send still throws.
   */
  async sendIfConfigured(message: OutboundEmail): Promise<void> {
    if (!this.canSend()) return;
    try {
      await this.provider.send(message);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`Email send failed: ${detail}`);
      throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
    }
  }

  appUrl(): string {
    const configured = this.config.get<string>('APP_URL')?.trim();
    if (configured) return normalizeAppUrl(configured);
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
    }
    return 'http://localhost:3000';
  }

  async send(message: OutboundEmail): Promise<void> {
    this.assertReady();
    try {
      await this.provider.send(message);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`Email send failed: ${detail}`);
      throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
    }
  }
}

function normalizeAppUrl(raw: string): string {
  const trimmed = raw.replace(/\/$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ServiceUnavailableException(EMAIL_UNAVAILABLE);
  }
  return trimmed;
}
