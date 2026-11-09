import { HttpException } from '@nestjs/common';
import { RateLimitError } from '../modules/auth/rate-limit';

/**
 * Sentry should see server failures and unexpected exceptions only.
 * Expected HttpExceptions (4xx, including validation, auth, and 429) are
 * control flow. RateLimitError is the app's 429 and is not an HttpException.
 */
export function shouldReportException(exception: unknown): boolean {
  if (exception instanceof RateLimitError) return false;
  if (exception instanceof HttpException) return exception.getStatus() >= 500;
  return true;
}
