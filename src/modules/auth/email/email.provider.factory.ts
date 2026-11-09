import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleEmailProvider } from './console-email.provider';
import { ResendEmailProvider } from './resend-email.provider';
import type { EmailProvider } from './email.types';

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/**
 * Production uses Resend. Everywhere else logs the message.
 * A missing production key does not throw here.
 */
export function createEmailProvider(config: ConfigService): EmailProvider {
  const nodeEnv = config.get<string>('NODE_ENV');
  if (nodeEnv === 'production') {
    const provider = new ResendEmailProvider(
      config.get<string>('RESEND_API_KEY'),
      config.get<string>('EMAIL_FROM'),
    );
    if (!provider.isConfigured() || !config.get<string>('APP_URL')?.trim()) {
      Logger.warn(
        'Email is not configured. Verification and password reset will fail until RESEND_API_KEY, EMAIL_FROM, and APP_URL are set.',
        'EmailProvider',
      );
    }
    return provider;
  }
  return new ConsoleEmailProvider();
}
