import { Logger } from '@nestjs/common';
import {
  ConsoleEmailProvider,
  redactMailTokens,
} from './console-email.provider';

describe('ConsoleEmailProvider', () => {
  const previous = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previous;
    jest.restoreAllMocks();
  });

  it('keeps the real link in the outbox and redacts it in logs outside development and test', async () => {
    process.env.NODE_ENV = 'production';
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const provider = new ConsoleEmailProvider();
    const text = [
      'http://localhost:3000/verify?token=raw-verify-token',
      'http://localhost:3000/reset?token=raw-reset-token',
    ].join('\n');

    await provider.send({
      to: 'owner@example.test',
      subject: 'Confirm your Prysmic email',
      text,
      html: '<a href="http://localhost:3000/reset?token=raw-reset-token">reset</a>',
    });

    const logged = String(log.mock.calls[0]?.[0]);
    expect(logged).toContain('token=[redacted]');
    expect(logged).not.toContain('raw-verify-token');
    expect(logged).not.toContain('raw-reset-token');
    expect(provider.outbox[0].text).toContain('raw-verify-token');
    expect(provider.outbox[0].text).toContain('raw-reset-token');
    expect(redactMailTokens(text)).not.toContain('raw-verify-token');
  });

  it('leaves the link readable in development and does not log during tests', async () => {
    process.env.NODE_ENV = 'development';
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const provider = new ConsoleEmailProvider();
    await provider.send({
      to: 'owner@example.test',
      subject: 'Reset your Prysmic password',
      text: 'http://localhost:3000/reset?token=dev-token',
      html: '',
    });
    expect(String(log.mock.calls[0]?.[0])).toContain('dev-token');

    log.mockClear();
    process.env.NODE_ENV = 'test';
    await provider.send({
      to: 'owner@example.test',
      subject: 'Reset your Prysmic password',
      text: 'http://localhost:3000/reset?token=test-token',
      html: '',
    });
    expect(log).not.toHaveBeenCalled();
    expect(provider.outbox[1].text).toContain('test-token');
  });
});
