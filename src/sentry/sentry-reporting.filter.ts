import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { shouldReportException } from './should-report';

/**
 * Sentry's catch-all preserves Nest's HTTP responses, but it treats every
 * HttpException as expected and drops 5xx. This filter reports 5xx itself
 * and leaves 4xx, including RateLimitError responses, unreported.
 */
@Injectable()
@Catch()
export class SentryReportingFilter extends SentryGlobalFilter {
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (
      Sentry.isEnabled() &&
      exception instanceof HttpException &&
      shouldReportException(exception)
    ) {
      Sentry.captureException(exception, {
        mechanism: {
          handled: false,
          type: 'auto.http.nestjs.global_filter',
        },
      });
    }

    // RateLimitError is not an HttpException, so the parent filter would
    // report it. Controller filters handle it first; this is the fallback.
    if (
      !shouldReportException(exception) &&
      !(exception instanceof HttpException)
    ) {
      BaseExceptionFilter.prototype.catch.call(this, exception, host);
      return;
    }

    super.catch(exception, host);
  }
}
