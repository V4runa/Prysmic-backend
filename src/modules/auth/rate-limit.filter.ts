import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { RATE_LIMIT_MESSAGE } from './account.constants';
import { RateLimitError } from './rate-limit';

@Catch(RateLimitError)
export class RateLimitFilter implements ExceptionFilter {
  catch(exception: RateLimitError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', String(exception.retryAfterSec));
    response.status(429).json({
      statusCode: 429,
      message: RATE_LIMIT_MESSAGE,
      error: 'Too Many Requests',
    });
  }
}
