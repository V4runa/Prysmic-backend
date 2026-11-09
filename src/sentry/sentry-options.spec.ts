import {
  createSentryOptions,
  isHealthRequest,
  resolveSentryEnvironment,
  sampleTrace,
  SENTRY_TRACES_SAMPLE_RATE,
} from './sentry-options';

describe('createSentryOptions', () => {
  it('stays disabled when SENTRY_DSN is missing or blank', () => {
    expect(createSentryOptions({})).toBeUndefined();
    expect(createSentryOptions({ SENTRY_DSN: '   ' })).toBeUndefined();
    expect(
      createSentryOptions({ NODE_ENV: 'production', SENTRY_DSN: '' }),
    ).toBeUndefined();
  });

  it('reads the DSN only from SENTRY_DSN and keeps profiling off', () => {
    const options = createSentryOptions({
      SENTRY_DSN: ' https://public@o0.ingest.sentry.io/1 ',
      NODE_ENV: 'production',
      RAILWAY_ENVIRONMENT_NAME: 'prysmic',
    });

    expect(options?.dsn).toBe('https://public@o0.ingest.sentry.io/1');
    expect(options?.sendDefaultPii).toBe(false);
    expect(options?.tracesSampleRate).toBe(SENTRY_TRACES_SAMPLE_RATE);
    expect(options?.profileSessionSampleRate).toBe(0);
    expect(options?.includeLocalVariables).toBe(false);
    expect(options?.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
    });
    expect(typeof options?.beforeSend).toBe('function');
    expect(typeof options?.beforeBreadcrumb).toBe('function');
    expect(options?.environment).toBe('production-prysmic');
  });
});

describe('sentry environment and health sampling', () => {
  it('uses NODE_ENV and appends RAILWAY_ENVIRONMENT_NAME when it differs', () => {
    expect(resolveSentryEnvironment({})).toBe('development');
    expect(resolveSentryEnvironment({ NODE_ENV: 'test' })).toBe('test');
    expect(
      resolveSentryEnvironment({
        NODE_ENV: 'production',
        RAILWAY_ENVIRONMENT_NAME: 'production',
      }),
    ).toBe('production');
    expect(
      resolveSentryEnvironment({
        NODE_ENV: 'production',
        RAILWAY_ENVIRONMENT_NAME: 'staging/eu',
      }),
    ).toBe('production-staging-eu');
  });

  it('does not trace /health and samples everything else at the low rate', () => {
    expect(isHealthRequest('/health')).toBe(true);
    expect(isHealthRequest('/health/')).toBe(true);
    expect(isHealthRequest('/health?ready=1')).toBe(true);
    expect(isHealthRequest('GET /health')).toBe(true);
    expect(isHealthRequest('/notes')).toBe(false);
    expect(isHealthRequest('/healthcare')).toBe(false);

    expect(sampleTrace({ name: 'GET /health' })).toBe(0);
    expect(
      sampleTrace({
        name: 'GET',
        attributes: { 'http.target': '/health?ready=1' },
      }),
    ).toBe(0);
    expect(sampleTrace({ name: 'POST /notes' })).toBe(
      SENTRY_TRACES_SAMPLE_RATE,
    );
  });
});
