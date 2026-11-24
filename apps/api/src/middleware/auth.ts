import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import { users } from '@sr-workspace/database';
import { getAccessToken } from '../lib/cookies';
import { verifyAccessToken } from '../lib/crypto';
import { getDb } from '../lib/db';
import { apiError } from '../lib/response';
import { AUTH_CONSTANTS } from '../config/constants';
import type { HonoEnv, AuthenticatedUser } from '../types/context';

export function authMiddleware(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const token = getAccessToken(c);
    if (!token) {
      return apiError(c, 'AUTH_UNAUTHORIZED', 'Authentication required. No session token provided.', 401);
    }

    const secret = c.env.JWT_SECRET || AUTH_CONSTANTS.DEFAULT_DEV_JWT_SECRET;
    let payload: any;

    try {
      payload = await verifyAccessToken(token, secret);
    } catch {
      return apiError(c, 'AUTH_UNAUTHORIZED', 'Session expired or token invalid. Please log in again.', 401);
    }

    if (!payload?.sub) {
      return apiError(c, 'AUTH_UNAUTHORIZED', 'Invalid token claims.', 401);
    }

    // Verify current user status in D1
    const db = getDb(c);
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub),
    });

    if (!user) {
      return apiError(c, 'AUTH_UNAUTHORIZED', 'User associated with session was not found.', 401);
    }

    if (user.status !== 'ACTIVE') {
      return apiError(
        c,
        'AUTH_FORBIDDEN',
        `User account is ${user.status.toLowerCase()}. Access denied.`,
        403
      );
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      tenantId: payload.tenantId,
      roles: payload.roles || [],
    };

    c.set('user', authenticatedUser);
    await next();
  };
}

export function optionalAuthMiddleware(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const token = getAccessToken(c);
    if (!token) {
      await next();
      return;
    }

    const secret = c.env.JWT_SECRET || AUTH_CONSTANTS.DEFAULT_DEV_JWT_SECRET;
    try {
      const payload = await verifyAccessToken(token, secret);
      if (payload?.sub) {
        const db = getDb(c);
        const user = await db.query.users.findFirst({
          where: eq(users.id, payload.sub),
        });

        if (user && user.status === 'ACTIVE') {
          c.set('user', {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            status: user.status,
            tenantId: payload.tenantId,
            roles: payload.roles || [],
          });
        }
      }
    } catch {
      // Ignored for optional auth
    }

    await next();
  };
}
