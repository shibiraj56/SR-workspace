import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../types/context';

export function requestLogger(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const start = performance.now();
    const requestId = c.req.header('x-request-id') || crypto.randomUUID();
    c.set('requestId', requestId);

    await next();

    const duration = Math.round(performance.now() - start);
    c.res.headers.set('x-request-id', requestId);
    c.res.headers.set('x-response-time', `${duration}ms`);

    // Safe security-conscious logging (omits bodies, query params, headers with auth)
    const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
    const status = c.res.status;
    const method = c.req.method;
    const path = c.req.path;

    if (c.env.APP_ENV !== 'test') {
      console.log(`[REQ] ${requestId.substring(0, 8)} ${method} ${path} ${status} (${duration}ms) - IP: ${clientIp}`);
    }
  };
}
