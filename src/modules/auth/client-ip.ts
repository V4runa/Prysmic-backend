import { normalizeIp } from './rate-limit';

type HeaderValue = string | string[] | undefined;

/**
 * Visitor address for rate limits.
 *
 * Railway's edge overwrites `X-Real-IP` with the connecting client, so that
 * header is not spoofable there. `req.ip` on its own follows the proxy chain
 * and can land on a shared infrastructure hop, which would put every visitor
 * in one bucket.
 */
export function clientIp(req: {
  ip?: string;
  headers?: Record<string, HeaderValue>;
}): string {
  const real = firstHeader(req.headers?.['x-real-ip'])?.trim();
  return normalizeIp(real || req.ip);
}

function firstHeader(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
