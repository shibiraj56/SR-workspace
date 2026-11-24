import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { createTestD1Database } from './mock-d1';
import { createDb, users } from '@sr-workspace/database';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../src/types/env';

describe('Authentication Engine & Lifecycle', () => {
  let app: ReturnType<typeof createApp>;
  let env: Bindings;

  beforeEach(() => {
    app = createApp();
    env = {
      DB: createTestD1Database(),
      APP_ENV: 'test',
      APP_NAME: 'SR WORKSPACE API',
      JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
    };
  });

  function extractCookie(res: Response, cookieName: string): string | undefined {
    const getSetCookie = (res.headers as any).getSetCookie?.();
    const rawCookies: string[] = getSetCookie || [res.headers.get('set-cookie') || ''];
    for (const cookieStr of rawCookies) {
      const parts = cookieStr.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        const firstSegment = trimmed.split(';')[0].trim();
        const prefix = `${cookieName}=`;
        if (firstSegment.startsWith(prefix)) {
          return firstSegment.slice(prefix.length);
        }
      }
    }
    return undefined;
  }

  it('should allow bootstrapping the initial administrator via registration', async () => {
    const res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@srcodelab.space',
          password: 'Password123!',
          firstName: 'Admin',
          lastName: 'User',
          tenantName: 'SR CODE LABS',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('admin@srcodelab.space');
    expect(body.data.tenant.name).toBe('SR CODE LABS');
    expect(body.data.roles).toContain('SUPER_ADMIN');

    // Password hashes must never be exposed
    expect(body.data.user.passwordHash).toBeUndefined();

    // Secure HttpOnly cookies must be set
    const accessCookie = extractCookie(res, 'sr_access');
    const refreshCookie = extractCookie(res, 'sr_refresh');
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
  });

  it('should reject subsequent unauthorized public registration when users already exist', async () => {
    // 1. Bootstrap first user
    const firstRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@srcodelab.space',
          password: 'Password123!',
          firstName: 'Admin',
          lastName: 'User',
        }),
      },
      env
    );
    expect(firstRes.status).toBe(201);

    // 2. Attempt second public registration without setupKey
    const res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'intruder@example.com',
          password: 'Password123!',
          firstName: 'Intruder',
          lastName: 'Guy',
        }),
      },
      env
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('REGISTRATION_CLOSED');
  });

  it('should authenticate valid credentials and issue HttpOnly cookies', async () => {
    // Setup user
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@srcodelab.space',
          password: 'CorrectPassword123!',
          firstName: 'Alice',
          lastName: 'Smith',
        }),
      },
      env
    );

    // Perform Login
    const res = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@srcodelab.space',
          password: 'CorrectPassword123!',
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('user@srcodelab.space');

    const accessCookie = extractCookie(res, 'sr_access');
    const refreshCookie = extractCookie(res, 'sr_refresh');
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
  });

  it('should reject invalid credentials with 401 Unauthorized', async () => {
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@srcodelab.space',
          password: 'CorrectPassword123!',
          firstName: 'Alice',
          lastName: 'Smith',
        }),
      },
      env
    );

    // Wrong password
    const res = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@srcodelab.space',
          password: 'WrongPassword!',
        }),
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('should reject login for disabled / locked users', async () => {
    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'locked@srcodelab.space',
          password: 'Password123!',
          firstName: 'Locked',
          lastName: 'User',
        }),
      },
      env
    );

    // Lock user in database
    const db = createDb(env.DB);
    await db.update(users).set({ status: 'LOCKED' }).where(eq(users.email, 'locked@srcodelab.space'));

    const res = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'locked@srcodelab.space',
          password: 'Password123!',
        }),
      },
      env
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_ACCOUNT_DISABLED');
  });

  it('should rotate refresh token on /api/v1/auth/refresh and issue new session', async () => {
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'rotatetest@srcodelab.space',
          password: 'Password123!',
          firstName: 'Rotate',
          lastName: 'User',
        }),
      },
      env
    );

    const initialRefreshToken = extractCookie(regRes, 'sr_refresh');
    expect(initialRefreshToken).toBeDefined();

    // Call refresh with original refresh token
    const refreshRes = await app.request(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: {
          Cookie: `sr_refresh=${initialRefreshToken}`,
        },
      },
      env
    );

    expect(refreshRes.status).toBe(200);
    const refreshedBody = (await refreshRes.json()) as any;
    expect(refreshedBody.success).toBe(true);

    const rotatedRefreshToken = extractCookie(refreshRes, 'sr_refresh');
    expect(rotatedRefreshToken).toBeDefined();
    expect(rotatedRefreshToken).not.toBe(initialRefreshToken);
  });

  it('should detect refresh token reuse, revoke all sessions, and reject with AUTH_TOKEN_REUSED', async () => {
    // 1. Register user
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'reusetest@srcodelab.space',
          password: 'Password123!',
          firstName: 'Reuse',
          lastName: 'User',
        }),
      },
      env
    );

    const tokenA = extractCookie(regRes, 'sr_refresh')!;

    // 2. Rotate tokenA -> tokenB is generated
    const refresh1 = await app.request(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: { Cookie: `sr_refresh=${tokenA}` },
      },
      env
    );
    expect(refresh1.status).toBe(200);
    const tokenB = extractCookie(refresh1, 'sr_refresh')!;

    // 3. An attacker attempts to reuse tokenA (which has now been revoked)
    const reuseAttempt = await app.request(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: { Cookie: `sr_refresh=${tokenA}` },
      },
      env
    );

    expect(reuseAttempt.status).toBe(401);
    const reuseBody = (await reuseAttempt.json()) as any;
    expect(reuseBody.error.code).toBe('AUTH_TOKEN_REUSED');

    // 4. Verify that tokenB was also invalidated as part of breach mitigation
    const tokenBAttempt = await app.request(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: { Cookie: `sr_refresh=${tokenB}` },
      },
      env
    );
    expect(tokenBAttempt.status).toBe(401);
  });

  it('should revoke active session and clear cookies on logout', async () => {
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'logout@srcodelab.space',
          password: 'Password123!',
          firstName: 'Logout',
          lastName: 'User',
        }),
      },
      env
    );

    const refreshToken = extractCookie(regRes, 'sr_refresh')!;
    const accessToken = extractCookie(regRes, 'sr_access')!;

    // Logout
    const logoutRes = await app.request(
      '/api/v1/auth/logout',
      {
        method: 'POST',
        headers: {
          Cookie: `sr_access=${accessToken}; sr_refresh=${refreshToken}`,
        },
      },
      env
    );

    expect(logoutRes.status).toBe(200);

    // Attempting to refresh with the logged-out token must fail
    const refreshAfterLogout = await app.request(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        headers: { Cookie: `sr_refresh=${refreshToken}` },
      },
      env
    );

    expect(refreshAfterLogout.status).toBe(401);
  });

  it('should return authenticated user profile on GET /api/v1/auth/me', async () => {
    const regRes = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'me@srcodelab.space',
          password: 'Password123!',
          firstName: 'Profile',
          lastName: 'Tester',
        }),
      },
      env
    );

    const accessToken = extractCookie(regRes, 'sr_access')!;

    const meRes = await app.request(
      '/api/v1/auth/me',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${accessToken}`,
        },
      },
      env
    );

    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as any;
    expect(meBody.success).toBe(true);
    expect(meBody.data.user.email).toBe('me@srcodelab.space');
    expect(meBody.data.activeTenant).toBeDefined();
    expect(meBody.data.roles).toContain('SUPER_ADMIN');
  });

  it('should reject unauthenticated access to /api/v1/auth/me with 401', async () => {
    const res = await app.request('/api/v1/auth/me', { method: 'GET' }, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('AUTH_UNAUTHORIZED');
  });
});
