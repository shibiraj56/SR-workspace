import { Hono } from 'hono';
import { AuthService } from './auth.service';
import { loginSchema, registerSchema } from './auth.schemas';
import { authMiddleware } from '../../middleware/auth';
import { loginRateLimiter } from '../../middleware/rate-limiter';
import { getDb } from '../../lib/db';
import {
  setAccessCookie,
  setRefreshCookie,
  getRefreshToken,
  clearAuthCookies,
} from '../../lib/cookies';
import { apiSuccess, apiError } from '../../lib/response';
import { getJwtSecret } from '../../lib/crypto';
import { AUTH_CONSTANTS } from '../../config/constants';
import type { HonoEnv } from '../../types/context';

export const authController = new Hono<HonoEnv>();

/**
 * POST /api/v1/auth/login
 * Authenticates user credentials, generates session, and sets HttpOnly cookies.
 */
authController.post('/login', loginRateLimiter(), async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = loginSchema.safeParse(rawBody);

  if (!validation.success) {
    const details = validation.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return apiError(c, 'VALIDATION_ERROR', 'Request validation failed.', 400, details);
  }

  const input = validation.data;
  const db = getDb(c);

  const metadata = {
    userAgent: c.req.header('user-agent'),
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
  };

  try {
    const jwtSecret = getJwtSecret(c.env);
    const result = await AuthService.login(db, input, metadata, jwtSecret);

    // Set secure HttpOnly cookies
    setAccessCookie(c, result.accessToken);
    setRefreshCookie(c, result.rawRefreshToken);

    return apiSuccess(
      c,
      {
        user: result.user,
        tenant: result.tenant,
        roles: result.roles,
        permissions: result.permissions,
      },
      200
    );
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/auth/register
 * Controlled user registration (initial bootstrap or invite).
 */
authController.post('/register', async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const validation = registerSchema.safeParse(rawBody);

  if (!validation.success) {
    const details = validation.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return apiError(c, 'VALIDATION_ERROR', 'Request validation failed.', 400, details);
  }

  const input = validation.data;
  const db = getDb(c);

  const metadata = {
    userAgent: c.req.header('user-agent'),
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
  };

  try {
    const jwtSecret = getJwtSecret(c.env);
    const result = await AuthService.register(db, input, metadata, jwtSecret);

    setAccessCookie(c, result.accessToken);
    setRefreshCookie(c, result.rawRefreshToken);

    return apiSuccess(
      c,
      {
        user: result.user,
        tenant: result.tenant,
        roles: result.roles,
      },
      201
    );
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/auth/refresh
 * Rotates the refresh token and returns fresh session credentials in HttpOnly cookies.
 */
authController.post('/refresh', async (c) => {
  const rawRefreshToken = getRefreshToken(c);
  if (!rawRefreshToken) {
    return apiError(c, 'AUTH_UNAUTHORIZED', 'No active refresh token session cookie found.', 401);
  }

  const db = getDb(c);

  const metadata = {
    userAgent: c.req.header('user-agent'),
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1',
  };

  try {
    const jwtSecret = getJwtSecret(c.env);
    const result = await AuthService.refresh(db, rawRefreshToken, metadata, jwtSecret);

    setAccessCookie(c, result.accessToken);
    setRefreshCookie(c, result.rawRefreshToken);

    return apiSuccess(
      c,
      {
        user: result.user,
        tenant: result.tenant,
        roles: result.roles,
      },
      200
    );
  } catch (err: any) {
    // If token reuse detected or invalid, clear existing cookies
    clearAuthCookies(c);
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});

/**
 * POST /api/v1/auth/logout
 * Revokes the active refresh token session and clears authentication cookies.
 */
authController.post('/logout', async (c) => {
  const rawRefreshToken = getRefreshToken(c);
  const db = getDb(c);

  if (rawRefreshToken) {
    await AuthService.logout(db, rawRefreshToken);
  }

  clearAuthCookies(c);
  return apiSuccess(c, { message: 'Session successfully revoked. Logged out.' }, 200);
});

/**
 * GET /api/v1/auth/me
 * Returns authenticated user profile, active tenant, and permissions.
 */
authController.get('/me', authMiddleware(), async (c) => {
  const currentUser = c.get('user')!;
  const db = getDb(c);

  try {
    const profile = await AuthService.getMe(db, currentUser.id);
    return apiSuccess(c, profile, 200);
  } catch (err: any) {
    if (err.code && err.status) {
      return apiError(c, err.code, err.message, err.status);
    }
    throw err;
  }
});
