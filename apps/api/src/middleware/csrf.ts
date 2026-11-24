import type { MiddlewareHandler } from 'hono';
import { apiError } from '../lib/response';
import type { HonoEnv } from '../types/context';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    // Safe idempotent methods do not mutate state
    if (SAFE_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    // Allow explicit bypass only when test bypass header is passed
    if (c.env.APP_ENV === 'test' && c.req.header('x-skip-csrf') === 'true') {
      await next();
      return;
    }

    // Defense-in-depth: Sec-Fetch-Site browser header validation
    const secFetchSite = c.req.header('sec-fetch-site');
    if (secFetchSite === 'cross-site') {
      return apiError(
        c,
        'CSRF_FORBIDDEN',
        'Cross-site request forgery protection: Untrusted cross-site request rejected.',
        403
      );
    }

    const origin = c.req.header('origin') || c.req.header('referer');
    const allowedOrigin = c.env.APP_ORIGIN || 'https://workspace.srcodelab.space';

    if (origin) {
      let isAllowed = false;
      try {
        const originUrl = new URL(origin);
        const originBase = originUrl.origin;
        const allowedBase = new URL(allowedOrigin).origin;

        if (originBase === allowedBase) {
          isAllowed = true;
        } else if (c.env.APP_ENV === 'development' || c.env.APP_ENV === 'test') {
          // In development and test, allow localhost and loopback IP
          if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
            isAllowed = true;
          }
        }
      } catch {
        isAllowed = false;
      }

      if (!isAllowed) {
        return apiError(
          c,
          'CSRF_FORBIDDEN',
          'Cross-site request forgery protection: Untrusted request origin.',
          403
        );
      }
    } else if (c.env.APP_ENV === 'production') {
      // In production, browser state-changing requests must supply an Origin or Referer
      const secFetchMode = c.req.header('sec-fetch-mode');
      if (secFetchMode === 'cors' || secFetchMode === 'same-origin') {
        return apiError(
          c,
          'CSRF_FORBIDDEN',
          'Cross-site request forgery protection: Missing request origin header.',
          403
        );
      }
    }

    await next();
  };
}
