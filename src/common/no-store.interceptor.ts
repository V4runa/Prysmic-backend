import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

type HeaderResponse = {
  headersSent?: boolean;
  getHeader?: (name: string) => unknown;
  setHeader?: (name: string, value: string) => void;
};

type HeaderRequest = {
  user?: unknown;
  url?: string;
  originalUrl?: string;
  headers?: { authorization?: string };
};

/**
 * Authenticated responses and auth routes carry tokens or private rows.
 * Leave a Cache-Control value that the handler already set (export sets
 * private, no-store; attachment bytes set a private max-age).
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<HeaderRequest>();
    const res = http.getResponse<HeaderResponse>();

    return next.handle().pipe(
      finalize(() => {
        if (!res?.setHeader || res.headersSent) return;
        if (res.getHeader?.('Cache-Control')) return;
        if (!shouldNoStore(req)) return;
        res.setHeader('Cache-Control', 'no-store');
      }),
    );
  }
}

function shouldNoStore(req: HeaderRequest): boolean {
  if (req.user != null) return true;
  const authorization = req.headers?.authorization;
  if (typeof authorization === 'string' && authorization.length > 0) {
    return true;
  }
  const path = (req.originalUrl || req.url || '').split('?')[0] ?? '';
  return path === '/auth' || path.startsWith('/auth/');
}
