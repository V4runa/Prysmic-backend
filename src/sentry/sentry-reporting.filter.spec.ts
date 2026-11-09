import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  InternalServerErrorException,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { SentryModule } from '@sentry/nestjs/setup';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppController } from '../app.controller';
import { RATE_LIMIT_MESSAGE } from '../modules/auth/account.constants';
import { RateLimitFilter } from '../modules/auth/rate-limit.filter';
import { RateLimitError } from '../modules/auth/rate-limit';
import { SentryReportingFilter } from './sentry-reporting.filter';

jest.mock('@sentry/nestjs', () => {
  const actual =
    jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs');
  return {
    ...actual,
    captureException: jest.fn(() => 'event-id'),
    isEnabled: jest.fn(() => false),
  };
});

@Controller('probe')
class ProbeController {
  @Get('bad')
  bad(): never {
    throw new BadRequestException('nope');
  }

  @Get('denied')
  denied(): never {
    throw new UnauthorizedException();
  }

  @Get('down')
  down(): never {
    throw new InternalServerErrorException('down');
  }

  @Get('boom')
  boom(): never {
    throw new Error('boom');
  }
}

@Controller('limited')
@UseFilters(RateLimitFilter)
class LimitedController {
  @Get()
  get(): never {
    throw new RateLimitError(9);
  }
}

describe('SentryReportingFilter', () => {
  let app: INestApplication;
  const captureException = Sentry.captureException as jest.Mock;
  const isEnabled = Sentry.isEnabled as jest.Mock;

  beforeEach(async () => {
    captureException.mockClear();
    isEnabled.mockReset();
    isEnabled.mockReturnValue(false);
    const moduleRef = await Test.createTestingModule({
      imports: [SentryModule.forRoot()],
      controllers: [AppController, ProbeController, LimitedController],
      providers: [{ provide: APP_FILTER, useClass: SentryReportingFilter }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves /health unchanged while Sentry is disabled', async () => {
    isEnabled.mockReturnValue(false);
    await request(app.getHttpServer() as App)
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('keeps 4xx responses and does not capture them', async () => {
    isEnabled.mockReturnValue(true);
    await request(app.getHttpServer() as App)
      .get('/probe/bad')
      .expect(400)
      .expect({
        statusCode: 400,
        message: 'nope',
        error: 'Bad Request',
      });
    await request(app.getHttpServer() as App)
      .get('/probe/denied')
      .expect(401);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('keeps the auth rate-limit filter response ahead of the global filter', async () => {
    isEnabled.mockReturnValue(true);
    const response = await request(app.getHttpServer() as App)
      .get('/limited')
      .expect(429);
    expect(response.headers['retry-after']).toBe('9');
    expect(response.body).toEqual({
      statusCode: 429,
      message: RATE_LIMIT_MESSAGE,
      error: 'Too Many Requests',
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('captures 5xx HttpExceptions and still returns the Nest response', async () => {
    isEnabled.mockReturnValue(true);
    await request(app.getHttpServer() as App)
      .get('/probe/down')
      .expect(500)
      .expect({
        statusCode: 500,
        message: 'down',
        error: 'Internal Server Error',
      });
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('does not capture 5xx when Sentry is disabled, and still returns 500', async () => {
    isEnabled.mockReturnValue(false);
    await request(app.getHttpServer() as App)
      .get('/probe/down')
      .expect(500);
    await request(app.getHttpServer() as App)
      .get('/probe/boom')
      .expect(500)
      .expect({
        statusCode: 500,
        message: 'Internal server error',
      });
    expect(captureException).not.toHaveBeenCalled();
  });
});
