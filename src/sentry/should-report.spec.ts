import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RateLimitError } from '../modules/auth/rate-limit';
import { shouldReportException } from './should-report';

describe('shouldReportException', () => {
  it.each([
    ['400', new BadRequestException('invalid')],
    ['401', new UnauthorizedException()],
    ['403', new ForbiddenException()],
    ['404', new NotFoundException()],
    ['409', new ConflictException('taken')],
    ['422', new UnprocessableEntityException('unprocessable')],
    ['429', new HttpException('Too Many Requests', 429)],
  ])('does not report expected HttpException %s', (_status, exception) => {
    expect(shouldReportException(exception)).toBe(false);
  });

  it('does not report RateLimitError, which the auth filter turns into 429', () => {
    expect(shouldReportException(new RateLimitError(3))).toBe(false);
  });

  it('reports 5xx HttpExceptions and unexpected errors', () => {
    expect(
      shouldReportException(new InternalServerErrorException('down')),
    ).toBe(true);
    expect(
      shouldReportException(new ServiceUnavailableException('email down')),
    ).toBe(true);
    expect(shouldReportException(new HttpException('bad gateway', 502))).toBe(
      true,
    );
    expect(shouldReportException(new Error('database unavailable'))).toBe(true);
    expect(shouldReportException('non-error throw')).toBe(true);
  });
});
