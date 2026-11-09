import * as dotenv from 'dotenv';
import * as Sentry from '@sentry/nestjs';
import { createSentryOptions } from './sentry/sentry-options';

// Loaded before the SDK init so a local .env SENTRY_DSN is visible.
// Railway injects the variable into the process environment before start.
dotenv.config();

const sentryOptions = createSentryOptions(process.env);
if (sentryOptions) {
  Sentry.init(sentryOptions);
}
