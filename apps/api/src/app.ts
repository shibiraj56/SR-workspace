import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestLogger } from './middleware/request-logger';
import { csrfProtection } from './middleware/csrf';
import { globalErrorHandler, notFoundHandler } from './middleware/error-handler';
import { healthController } from './modules/health/health.controller';
import { authController } from './modules/auth/auth.controller';
import { usersController } from './modules/users/users.controller';
import { departmentsController } from './modules/departments/departments.controller';
import { employeesController } from './modules/employees/employees.controller';
import { projectsController } from './modules/projects/projects.controller';
import { tasksController } from './modules/tasks/tasks.controller';
import { conversationsController } from './modules/communication/conversations.controller';
import { messagesController } from './modules/communication/messages.controller';
import { notificationsController } from './modules/communication/notifications.controller';
import { hrController } from './modules/hr/hr.controller';
import type { HonoEnv } from './types/context';

async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);

  if (typeof (crypto.subtle as any)?.timingSafeEqual === 'function') {
    return (crypto.subtle as any).timingSafeEqual(hashA, hashB);
  }

  const nodeCrypto = (globalThis as any).crypto;
  if (typeof nodeCrypto?.timingSafeEqual === 'function') {
    return nodeCrypto.timingSafeEqual(new Uint8Array(hashA), new Uint8Array(hashB));
  }

  const u8a = new Uint8Array(hashA);
  const u8b = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < u8a.length; i++) {
    diff |= u8a[i] ^ u8b[i];
  }
  return diff === 0;
}

export function createApp() {
  const app = new Hono<HonoEnv>();

  // 1. Request ID and Request Logging
  app.use('*', requestLogger());

  // 2. CORS configuration (Strict Origin Validation for Browser App)
  app.use('*', async (c, next) => {
    const allowedOrigin = c.env.APP_ORIGIN || 'https://workspace.srcodelab.space';
    const corsMiddleware = cors({
      origin: (origin) => {
        if (!origin) return allowedOrigin;
        try {
          const originUrl = new URL(origin);
          const allowedUrl = new URL(allowedOrigin);

          if (originUrl.origin === allowedUrl.origin) {
            return origin;
          }

          // In development and test environments, allow localhost and loopback IP
          if (c.env.APP_ENV === 'development' || c.env.APP_ENV === 'test') {
            if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
              return origin;
            }
          }
        } catch {
          // Invalid origin format
        }
        // Reject all untrusted origins (returns null so no Access-Control-Allow-Origin is sent)
        return null;
      },
      credentials: true,
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'X-Tenant-Id',
        'X-CSRF-Token',
      ],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['X-Request-Id', 'X-Response-Time'],
      maxAge: 86400,
    });
    return corsMiddleware(c, next);
  });

  // 3. Security Headers
  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('X-XSS-Protection', '1; mode=block');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  // 4. Staging API Worker Guard (Dual-layer security: fail closed on direct worker requests)
  app.use('*', async (c, next) => {
    if (c.env?.APP_ENV === 'staging') {
      // Intentional bypass for CORS preflight
      if (c.req.method === 'OPTIONS') {
        return await next();
      }

      const expectedSecret = c.env?.STAGING_PROXY_SECRET;
      if (!expectedSecret) {
        return c.json(
          {
            success: false,
            error: {
              code: 'PROXY_GUARD_MISCONFIGURED',
              message: 'Staging proxy secret is not configured on the worker.',
            },
          },
          500
        );
      }

      const providedSecret = c.req.header('x-staging-proxy-secret');
      if (!providedSecret || !(await timingSafeEqualStrings(providedSecret, expectedSecret))) {
        return c.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN_DIRECT_ACCESS',
              message: 'Direct access to staging API is restricted. Requests must route through the staging access proxy.',
            },
          },
          403
        );
      }
    }

    await next();
  });

  // 5. CSRF protection on state-changing browser requests
  app.use('/api/v1/*', csrfProtection());

  // 6. Mount Domain Routes
  app.route('/api/v1/health', healthController);
  app.route('/api/v1/auth', authController);
  app.route('/api/v1/users', usersController);
  app.route('/api/v1/departments', departmentsController);
  app.route('/api/v1/employees', employeesController);
  app.route('/api/v1/projects', projectsController);
  app.route('/api/v1/tasks', tasksController);
  app.route('/api/v1/conversations', conversationsController);
  app.route('/api/v1/messages', messagesController);
  app.route('/api/v1/notifications', notificationsController);
  app.route('/api/v1/hr', hrController);

  // 6. Global Error Handling
  app.onError(globalErrorHandler);
  app.notFound(notFoundHandler);

  return app;
}

export const app = createApp();
