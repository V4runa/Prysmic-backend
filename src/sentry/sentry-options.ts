import type { Integration } from '@sentry/core';
import type { NodeOptions } from '@sentry/nestjs';
import * as Sentry from '@sentry/nestjs';
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
} from './scrub';

export const SENTRY_TRACES_SAMPLE_RATE = 0.1;

type SentryEnv = NodeJS.ProcessEnv;

export type SentryInitOptions = NodeOptions & { sendDefaultPii: false };

function sanitizeEnvironment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/[\r\n]+/g, '')
    .replace(/[/\s]+/g, '-')
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!cleaned || cleaned.toLowerCase() === 'none') return undefined;
  return cleaned.slice(0, 64);
}

/** NODE_ENV, plus RAILWAY_ENVIRONMENT_NAME when it adds information. */
export function resolveSentryEnvironment(env: SentryEnv): string {
  const nodeEnv = sanitizeEnvironment(env.NODE_ENV) || 'development';
  const railway = sanitizeEnvironment(env.RAILWAY_ENVIRONMENT_NAME);
  if (!railway || railway === nodeEnv) return nodeEnv;
  return `${nodeEnv}-${railway}`.slice(0, 64);
}

export function isHealthRequest(value: string): boolean {
  const trimmed = value.trim();
  const withoutQuery = trimmed.split(/[?#]/)[0] ?? '';
  const methodSplit = withoutQuery.match(
    /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)$/i,
  );
  let path = methodSplit?.[1] ?? withoutQuery;
  if (path.includes('://')) {
    try {
      path = new URL(path).pathname;
    } catch {
      // Keep the raw path when it is not a URL.
    }
  }
  return path === '/health' || path === '/health/';
}

export function sampleTrace(context: {
  name?: string;
  attributes?: Record<string, unknown>;
  inheritOrSampleWith?: (fallbackSampleRate: number) => number;
}): number {
  const candidates = [
    context.name,
    context.attributes?.['http.route'],
    context.attributes?.['http.target'],
    context.attributes?.['url.path'],
    context.attributes?.['url.full'],
  ];
  if (
    candidates.some(
      (value) => typeof value === 'string' && isHealthRequest(value),
    )
  ) {
    return 0;
  }
  return (
    context.inheritOrSampleWith?.(SENTRY_TRACES_SAMPLE_RATE) ??
    SENTRY_TRACES_SAMPLE_RATE
  );
}

function readDsn(env: SentryEnv): string | undefined {
  const dsn = env.SENTRY_DSN?.trim();
  return dsn ? dsn : undefined;
}

/**
 * Returns init options only when SENTRY_DSN is set. Callers must skip
 * Sentry.init entirely otherwise, so the SDK never opens a transport.
 */
export function createSentryOptions(
  env: SentryEnv,
): SentryInitOptions | undefined {
  const dsn = readDsn(env);
  if (!dsn) return undefined;

  const options = {
    dsn,
    environment: resolveSentryEnvironment(env),
    // Removed from the public types in @sentry/nestjs 11. Still set so a
    // runtime that reads it stays off. dataCollection is what v11 enforces.
    sendDefaultPii: false as const,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    profileSessionSampleRate: 0,
    includeLocalVariables: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      queues: false,
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    tracesSampler: sampleTrace,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSendSpan: scrubSentrySpan,
    integrations: (integrations: Integration[]) =>
      integrations.map((integration) =>
        integration.name === 'Http'
          ? Sentry.httpIntegration({
              maxRequestBodySize: 'none',
              ignoreIncomingRequests: (urlPath) => isHealthRequest(urlPath),
            })
          : integration,
      ),
  } satisfies SentryInitOptions;

  return options;
}
