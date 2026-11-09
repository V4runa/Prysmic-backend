import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { StreamedSpanJSON } from '@sentry/core';
import type { Breadcrumb, ErrorEvent } from '@sentry/nestjs';
import {
  contextHasPrivatePayload,
  redactSensitiveText,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
  stripUrlQuery,
} from './scrub';

function event(partial: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    type: undefined,
    ...partial,
  };
}

describe('scrubSentryEvent', () => {
  it('strips bodies, cookies, auth headers, query strings, and user identity', () => {
    const scrubbed = scrubSentryEvent(
      event({
        request: {
          method: 'POST',
          url: 'https://api.prysmic.me/notes?token=reset-secret&q=diary',
          query_string: 'token=reset-secret',
          data: { content: 'dear diary', password: 'hunter2' },
          cookies: { session: 'abc' },
          env: { REMOTE_ADDR: '203.0.113.5' },
          headers: {
            'content-type': 'application/json',
            Authorization: 'Bearer secret-token',
            'X-Auth-Token': 'another',
            cookie: 'session=abc',
            'x-forwarded-for': '203.0.113.5',
            'x-request-id': 'req-1',
          },
        },
        user: {
          id: 'user-1',
          email: 'person@example.test',
          ip_address: '203.0.113.5',
          username: 'person',
        },
      }),
    );

    expect(scrubbed?.request).toEqual({
      method: 'POST',
      url: 'https://api.prysmic.me/notes',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-1',
      },
    });
    expect(scrubbed?.user).toBeUndefined();
    expect(JSON.stringify(scrubbed)).not.toContain('dear diary');
    expect(JSON.stringify(scrubbed)).not.toContain('hunter2');
    expect(JSON.stringify(scrubbed)).not.toContain('person@example.test');
    expect(JSON.stringify(scrubbed)).not.toContain('203.0.113.5');
    expect(JSON.stringify(scrubbed)).not.toContain('secret-token');
  });

  it('drops extra context and breadcrumbs that carry payloads or SQL parameters', () => {
    const scrubbed = scrubSentryEvent(
      event({
        extra: {
          statusCode: 500,
          note: 'private journal entry',
          parameters: ['task text'],
        },
        contexts: {
          trace: { trace_id: 'abc', span_id: 'def' },
          mood: { text: 'feeling low' },
        },
        breadcrumbs: [
          {
            category: 'http',
            data: {
              method: 'GET',
              url: 'https://api.prysmic.me/tasks?email=a@b.test',
              status_code: 500,
            },
          },
          {
            category: 'query',
            message: 'INSERT INTO notes (content) VALUES ($1)',
            data: {
              'db.system': 'postgresql',
              parameters: ['dear diary'],
            },
          },
          {
            category: 'console',
            message:
              'to=person@example.test subject=Reset\nhttp://localhost/reset?token=abc',
          },
        ],
      }),
    );

    expect(scrubbed?.extra).toBeUndefined();
    expect(scrubbed?.contexts).toEqual({
      trace: { trace_id: 'abc', span_id: 'def' },
    });
    expect(scrubbed?.breadcrumbs).toEqual([
      {
        category: 'http',
        data: {
          method: 'GET',
          url: 'https://api.prysmic.me/tasks',
          status_code: 500,
        },
      },
    ]);
  });

  it('keeps a safe extra bag and redacts emails inside the exception text', () => {
    const scrubbed = scrubSentryEvent(
      event({
        message: 'failed for person@example.test',
        extra: { statusCode: 500 },
        exception: {
          values: [
            {
              type: 'Error',
              value:
                "duplicate key Key (email)=(person@example.test) INSERT INTO users (email) VALUES ('person@example.test')",
              stacktrace: {
                frames: [{ filename: 'user.service.ts', vars: { note: 'x' } }],
              },
            },
          ],
        },
      }),
    );

    expect(scrubbed?.extra).toEqual({ statusCode: 500 });
    expect(scrubbed?.message).toBe('failed for [redacted]');
    expect(scrubbed?.exception?.values?.[0]?.value).not.toContain(
      'person@example.test',
    );
    expect(
      scrubbed?.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars,
    ).toBeUndefined();
  });

  it('drops the event when the original exception is a 4xx HttpException', () => {
    expect(
      scrubSentryEvent(event({ message: 'nope' }), {
        originalException: new BadRequestException('nope'),
      }),
    ).toBeNull();
    expect(
      scrubSentryEvent(event({ message: 'down' }), {
        originalException: new InternalServerErrorException('down'),
      })?.message,
    ).toBe('down');
  });
});

describe('scrubSentryBreadcrumb', () => {
  it('drops breadcrumbs that contain note, task, mood, email, password, or token payloads', () => {
    const payloads: Breadcrumb[] = [
      { category: 'http', data: { body: { content: 'dear diary' } } },
      { category: 'http', data: { task: 'buy milk' } },
      { category: 'http', data: { mood: 'anxious' } },
      { data: { email: 'person@example.test' } },
      { data: { password: 'hunter2' } },
      { data: { resetToken: 'abc', verificationToken: 'def' } },
      {
        message: "INSERT INTO notes (content) VALUES ('dear diary')",
      },
    ];
    for (const breadcrumb of payloads) {
      expect(scrubSentryBreadcrumb(breadcrumb)).toBeNull();
    }
  });

  it('strips query strings and auth headers from an otherwise safe breadcrumb', () => {
    expect(
      scrubSentryBreadcrumb({
        category: 'http',
        data: {
          method: 'POST',
          url: 'https://api.prysmic.me/notes?token=secret#fragment',
          status_code: 500,
          'url.query': 'token=secret',
          headers: {
            Authorization: 'Bearer secret',
            'content-type': 'application/json',
          },
        },
      }),
    ).toEqual({
      category: 'http',
      data: {
        method: 'POST',
        url: 'https://api.prysmic.me/notes',
        status_code: 500,
        headers: { 'content-type': 'application/json' },
      },
    });
  });
});

describe('scrub helpers', () => {
  it('strips query strings and fragments from urls', () => {
    expect(stripUrlQuery('/notes?token=abc#reset')).toBe('/notes');
  });

  it('redacts emails, bearer tokens, and SQL literals', () => {
    expect(redactSensitiveText('bearer abc.def user@example.test')).toBe(
      'bearer [redacted] [redacted]',
    );
    expect(
      redactSensitiveText("INSERT INTO notes (content) VALUES ('dear diary')"),
    ).toBe("INSERT INTO notes (content) VALUES ('[redacted]')");
  });

  it('detects SQL parameter bags and request payloads', () => {
    expect(contextHasPrivatePayload({ parameters: ['secret'] })).toBe(true);
    expect(contextHasPrivatePayload({ statusCode: 500 })).toBe(false);
    expect(contextHasPrivatePayload({ note: 'dear diary' })).toBe(true);
  });

  it('removes query strings, auth, and SQL parameters from spans', () => {
    const span: StreamedSpanJSON = {
      trace_id: 'trace',
      span_id: 'span',
      name: 'GET /notes?token=secret',
      start_timestamp: 1,
      status: 'error',
      is_segment: true,
      attributes: {
        'url.full': 'https://api.prysmic.me/notes?token=secret',
        'url.query': 'token=secret',
        'http.request.header.authorization': 'Bearer secret',
        'db.query.parameter.0': 'dear diary',
        'user.email': 'person@example.test',
        'http.response.status_code': 500,
      },
    };
    const scrubbed = scrubSentrySpan(span);
    expect(scrubbed.name).toBe('GET /notes');
    expect(scrubbed.attributes['url.full']).toBe(
      'https://api.prysmic.me/notes',
    );
    expect(scrubbed.attributes['url.query']).toBeUndefined();
    expect(
      scrubbed.attributes['http.request.header.authorization'],
    ).toBeUndefined();
    expect(scrubbed.attributes['db.query.parameter.0']).toBeUndefined();
    expect(scrubbed.attributes['user.email']).toBeUndefined();
    expect(scrubbed.attributes['http.response.status_code']).toBe(500);
  });
});
