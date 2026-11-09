import type {
  Breadcrumb,
  ErrorEvent,
  EventHint,
  RequestEventData,
  StackFrame,
} from '@sentry/nestjs';
import type { StreamedSpanJSON } from '@sentry/core';
import { shouldReportException } from './should-report';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SECRET_ASSIGNMENT_RE =
  /(?:password|passwd|pwd|secret|(?:reset|verification|access|refresh|id)?_?token)\s*[:=]\s*\S+/i;
const BEARER_RE = /bearer\s+\S+/i;
const SQL_KEYWORD_RE = /\b(select|insert|update|delete|values)\b/i;
const SQL_LITERAL_RE = /'(?:''|[^'])*'/;

const PAYLOAD_KEYS = new Set([
  'note',
  'notes',
  'notetext',
  'notecontent',
  'content',
  'body',
  'payload',
  'text',
  'task',
  'tasks',
  'tasktext',
  'mood',
  'moods',
  'moodtext',
  'moodnote',
  'title',
  'description',
  'journal',
  'entry',
  'email',
  'emails',
  'password',
  'passwd',
  'pwd',
  'token',
  'tokens',
  'resettoken',
  'verificationtoken',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'secret',
  'authorization',
  'cookie',
  'cookies',
  'otp',
  'apikey',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPayloadKey(key: string): boolean {
  const norm = normalizeKey(key);
  if (PAYLOAD_KEYS.has(norm)) return true;
  return (
    norm.endsWith('body') ||
    norm.endsWith('payload') ||
    norm.includes('password') ||
    norm.includes('passwd') ||
    norm.includes('token') ||
    norm.includes('secret') ||
    norm.includes('authorization') ||
    norm.includes('cookie') ||
    norm.endsWith('email')
  );
}

function isSqlParameterKey(key: string): boolean {
  const norm = normalizeKey(key);
  const lower = key.toLowerCase();
  return (
    norm === 'params' ||
    norm === 'parameters' ||
    norm === 'bindings' ||
    norm === 'bindparams' ||
    lower.includes('query.parameter') ||
    lower.includes('db.params') ||
    norm.includes('queryparameter') ||
    norm.includes('dbparams')
  );
}

function isQueryStringKey(key: string): boolean {
  const norm = normalizeKey(key);
  return (
    norm === 'querystring' ||
    norm === 'urlquery' ||
    norm === 'urlfragment' ||
    key === 'url.query' ||
    key === 'url.fragment'
  );
}

export function isSensitiveHeader(name: string): boolean {
  const norm = name.toLowerCase();
  return (
    norm.includes('auth') ||
    norm.includes('token') ||
    norm.includes('cookie') ||
    norm.includes('password') ||
    norm.includes('secret') ||
    norm === 'x-api-key' ||
    norm === 'x-forwarded-for' ||
    norm === 'x-real-ip' ||
    norm === 'forwarded' ||
    norm === 'cf-connecting-ip' ||
    norm === 'true-client-ip' ||
    norm === 'x-client-ip'
  );
}

export function stripUrlQuery(url: string): string {
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  // Fragments can carry reset tokens. Drop them with the query string.
  return queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
}

function stripUrlQueriesInText(value: string): string {
  return value.replace(/((?:https?:\/\/|\/)[^\s?#]*)[?#][^\s]*/gi, '$1');
}

function sqlHasLiterals(value: string): boolean {
  return SQL_KEYWORD_RE.test(value) && SQL_LITERAL_RE.test(value);
}

function textHasPrivatePayload(value: string): boolean {
  const stripped = stripUrlQueriesInText(value);
  return (
    EMAIL_RE.test(stripped) ||
    SECRET_ASSIGNMENT_RE.test(stripped) ||
    BEARER_RE.test(stripped) ||
    sqlHasLiterals(stripped)
  );
}

export function redactSensitiveText(value: string): string {
  const withoutUrls = stripUrlQueriesInText(value);
  const withoutSecrets = withoutUrls
    .replace(BEARER_RE, 'bearer [redacted]')
    .replace(SECRET_ASSIGNMENT_RE, '[redacted]')
    .replace(EMAIL_RE, '[redacted]');
  if (!SQL_KEYWORD_RE.test(withoutSecrets)) return withoutSecrets;
  return withoutSecrets.replace(/'(?:''|[^'])*'/g, "'[redacted]'");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * True when a breadcrumb or extra bag carries SQL parameter values or a
 * request payload (note, task, or mood text, email, password, token).
 * Query strings and auth headers are stripped separately and do not count.
 * Header maps are walked so an Authorization value does not drop the crumb.
 */
export function contextHasPrivatePayload(
  value: unknown,
  depth = 0,
  insideHeaders = false,
): boolean {
  if (value == null || depth > 8) return false;
  if (typeof value === 'string') return textHasPrivatePayload(value);
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) =>
      contextHasPrivatePayload(item, depth + 1, insideHeaders),
    );
  }
  for (const [key, child] of Object.entries(value)) {
    if (isQueryStringKey(key)) continue;
    if (insideHeaders && isSensitiveHeader(key)) continue;
    if (isPayloadKey(key) || isSqlParameterKey(key)) return true;
    if (
      contextHasPrivatePayload(
        child,
        depth + 1,
        insideHeaders || normalizeKey(key) === 'headers',
      )
    ) {
      return true;
    }
  }
  return false;
}

function stripRecordSecrets(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (
      isSensitiveHeader(key) ||
      isQueryStringKey(key) ||
      key === 'cookies' ||
      key === 'cookie'
    ) {
      delete record[key];
      continue;
    }
    const value = record[key];
    if (typeof value === 'string' && /url/i.test(key)) {
      record[key] = stripUrlQuery(value);
    } else if (isRecord(value)) {
      if (key === 'headers') stripHeaders(value);
      else stripRecordSecrets(value);
    }
  }
}

function stripHeaders(headers: Record<string, unknown>): void {
  for (const key of Object.keys(headers)) {
    if (isSensitiveHeader(key)) delete headers[key];
  }
}

function scrubRequest(request: RequestEventData): void {
  delete request.data;
  delete request.cookies;
  delete request.query_string;
  delete request.env;
  if (typeof request.url === 'string') {
    request.url = stripUrlQuery(request.url);
  }
  if (request.headers) stripHeaders(request.headers);
}

function scrubFrames(frames: StackFrame[] | undefined): void {
  if (!frames) return;
  for (const frame of frames) delete frame.vars;
}

export function scrubSentryBreadcrumb(
  breadcrumb: Breadcrumb,
): Breadcrumb | null {
  const copy = structuredClone(breadcrumb);
  const message =
    typeof copy.message === 'string' && textHasPrivatePayload(copy.message);
  if (message || contextHasPrivatePayload(copy.data)) return null;
  if (typeof copy.message === 'string') {
    copy.message = stripUrlQueriesInText(copy.message);
  }
  if (isRecord(copy.data)) stripRecordSecrets(copy.data);
  return copy;
}

export function scrubSentryEvent(
  event: ErrorEvent,
  hint?: EventHint,
): ErrorEvent | null {
  if (
    hint?.originalException !== undefined &&
    !shouldReportException(hint.originalException)
  ) {
    return null;
  }

  const copy = structuredClone(event);
  if (copy.request) scrubRequest(copy.request);
  delete copy.user;

  if (copy.extra && contextHasPrivatePayload(copy.extra)) delete copy.extra;
  else if (isRecord(copy.extra)) stripRecordSecrets(copy.extra);

  if (isRecord(copy.contexts)) {
    for (const key of Object.keys(copy.contexts)) {
      const value = copy.contexts[key];
      if (contextHasPrivatePayload(value)) {
        delete copy.contexts[key];
        continue;
      }
      if (isRecord(value)) stripRecordSecrets(value);
    }
  }

  if (copy.breadcrumbs) {
    copy.breadcrumbs = copy.breadcrumbs
      .map((breadcrumb) => scrubSentryBreadcrumb(breadcrumb))
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);
  }

  if (typeof copy.message === 'string') {
    copy.message = redactSensitiveText(copy.message);
  }
  if (copy.logentry) {
    if (typeof copy.logentry.message === 'string') {
      copy.logentry.message = redactSensitiveText(copy.logentry.message);
    }
    delete copy.logentry.params;
  }
  for (const item of copy.exception?.values ?? []) {
    if (typeof item.value === 'string') {
      item.value = redactSensitiveText(item.value);
    }
    scrubFrames(item.stacktrace?.frames);
  }

  return copy;
}

function isIpAttribute(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes('ip_address') ||
    lower.includes('client.address') ||
    lower.includes('peer.address') ||
    lower.endsWith('.ip') ||
    lower === 'user.ip' ||
    lower === 'user.email' ||
    lower === 'user.id' ||
    lower === 'user.username'
  );
}

export function scrubSentrySpan(span: StreamedSpanJSON): StreamedSpanJSON {
  const attributes: StreamedSpanJSON['attributes'] = { ...span.attributes };
  for (const key of Object.keys(attributes)) {
    if (
      isSensitiveHeader(key) ||
      isQueryStringKey(key) ||
      isPayloadKey(key) ||
      isSqlParameterKey(key) ||
      isIpAttribute(key)
    ) {
      delete attributes[key];
      continue;
    }
    const value = attributes[key];
    if (typeof value === 'string' && /url|statement|query/i.test(key)) {
      attributes[key] = redactSensitiveText(stripUrlQuery(value));
    }
  }
  return {
    ...span,
    name: stripUrlQueriesInText(span.name),
    attributes,
  };
}
