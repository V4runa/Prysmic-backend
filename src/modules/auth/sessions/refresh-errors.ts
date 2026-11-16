import { UnauthorizedException } from '@nestjs/common';
import {
  REFRESH_EXPIRED,
  REFRESH_EXPIRED_CODE,
  REFRESH_REVOKED,
  REFRESH_REVOKED_CODE,
} from '../account.constants';
import type { RefreshFailure } from './refresh-session.service';

/**
 * `code` is the stable value the client branches on.
 * Logout, password change, deletion, an unknown token, and reuse of a
 * rotated token after the grace window all use refresh_revoked. A token
 * that aged out without being rotated uses refresh_expired. Presenting the
 * token that was just rotated, inside the grace window, is a success.
 */
export function refreshDenied(reason: RefreshFailure): UnauthorizedException {
  if (reason === 'expired') {
    return new UnauthorizedException({
      statusCode: 401,
      message: REFRESH_EXPIRED,
      error: 'Unauthorized',
      code: REFRESH_EXPIRED_CODE,
    });
  }
  return new UnauthorizedException({
    statusCode: 401,
    message: REFRESH_REVOKED,
    error: 'Unauthorized',
    code: REFRESH_REVOKED_CODE,
  });
}
