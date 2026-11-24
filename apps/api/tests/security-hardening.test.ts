import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { createTestD1Database } from './mock-d1';
import { clearRateLimitStore } from '../src/middleware/rate-limiter';
import { signAccessToken } from '../src/lib/crypto';
import {
  createDb,
  users,
  tenants,
  userTenants,
  roles,
  userRoles,
} from '@sr-workspace/database';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../src/types/env';

describe('Security Hardening & Verification Audit', () => {
  let app: ReturnType<typeof createApp>;
  let env: Bindings;
  const JWT_SECRET = 'hardening-test-secret-32-chars-long!!';

  beforeEach(() => {
    clearRateLimitStore();
    app = createApp();
    env = {
      DB: createTestD1Database(),
      APP_ENV: 'test',
      APP_NAME: 'SR WORKSPACE API',
      JWT_SECRET,
      APP_ORIGIN: 'https://workspace.srcodelab.space',
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

  function getSetCookieHeaders(res: Response): string[] {
    const getSetCookie = (res.headers as any).getSetCookie?.();
    if (getSetCookie && Array.isArray(getSetCookie)) return getSetCookie;
    const header = res.headers.get('set-cookie');
    return header ? [header] : [];
  }

  /* -------------------------------------------------------------------------- */
  /* 1. Rate Limiting Across Independent Requests                               */
  /* -------------------------------------------------------------------------- */
  describe('1. Rate Limiting Verification', () => {
    it('should enforce rate limits across independent requests and return 429 with Retry-After', async () => {
      // Login rate limit is 5 requests per minute
      // First, register a user
      await app.request(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-skip-rate-limit': 'true' },
          body: JSON.stringify({
            email: 'ratelimit@srcodelab.space',
            password: 'Password123!',
            firstName: 'Rate',
            lastName: 'Limit',
          }),
        },
        env
      );

      const clientIp = '198.51.100.42';

      // Send 5 valid login attempts (max limit)
      for (let i = 1; i <= 5; i++) {
        const res = await app.request(
          '/api/v1/auth/login',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'cf-connecting-ip': clientIp,
            },
            body: JSON.stringify({
              email: 'ratelimit@srcodelab.space',
              password: 'Password123!',
            }),
          },
          env
        );
        expect(res.status).toBe(200);
      }

      // The 6th request from the same IP must be rejected with 429
      const blockedRes = await app.request(
        '/api/v1/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': clientIp,
          },
          body: JSON.stringify({
            email: 'ratelimit@srcodelab.space',
            password: 'Password123!',
          }),
        },
        env
      );

      expect(blockedRes.status).toBe(429);
      const blockedBody = (await blockedRes.json()) as any;
      expect(blockedBody.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(blockedRes.headers.get('Retry-After')).toBeDefined();

      // Requests from a DIFFERENT IP should not be affected
      const otherIpRes = await app.request(
        '/api/v1/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': '203.0.113.88',
          },
          body: JSON.stringify({
            email: 'ratelimit@srcodelab.space',
            password: 'Password123!',
          }),
        },
        env
      );
      expect(otherIpRes.status).toBe(200);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Authentication Security: Signature, Expiry, Concurrency                */
  /* -------------------------------------------------------------------------- */
  describe('2. Authentication Security Verification', () => {
    it('should reject access tokens signed with an invalid secret or forged signature', async () => {
      // Sign token with a different secret
      const forgedToken = await signAccessToken(
        { sub: 'hacker-id', email: 'hacker@evil.com' },
        'wrong-unauthorized-secret-at-least-32-chars!'
      );

      const res = await app.request(
        '/api/v1/auth/me',
        {
          method: 'GET',
          headers: { Cookie: `sr_access=${forgedToken}` },
        },
        env
      );

      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should reject expired access tokens', async () => {
      // Sign token that expired 10 seconds ago
      const expiredToken = await signAccessToken(
        { sub: 'expired-id', email: 'expired@srcodelab.space' },
        JWT_SECRET,
        -10 // Expired 10 seconds in the past
      );

      const res = await app.request(
        '/api/v1/auth/me',
        {
          method: 'GET',
          headers: { Cookie: `sr_access=${expiredToken}` },
        },
        env
      );

      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should handle concurrent refresh requests safely without race condition duplicates', async () => {
      const regRes = await app.request(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-skip-rate-limit': 'true' },
          body: JSON.stringify({
            email: 'concurrent@srcodelab.space',
            password: 'Password123!',
            firstName: 'Concurrent',
            lastName: 'User',
          }),
        },
        env
      );

      const initialRefreshToken = extractCookie(regRes, 'sr_refresh')!;

      // Fire 2 simultaneous refresh requests with the EXACT SAME initial refresh token
      const [res1, res2] = await Promise.all([
        app.request(
          '/api/v1/auth/refresh',
          {
            method: 'POST',
            headers: { Cookie: `sr_refresh=${initialRefreshToken}`, 'x-skip-rate-limit': 'true' },
          },
          env
        ),
        app.request(
          '/api/v1/auth/refresh',
          {
            method: 'POST',
            headers: { Cookie: `sr_refresh=${initialRefreshToken}`, 'x-skip-rate-limit': 'true' },
          },
          env
        ),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one request must succeed (200), and the competing request must be rejected (401)
      expect(statuses).toEqual([200, 401]);
    });

    it('should reject disabled user on /me and on /refresh', async () => {
      const regRes = await app.request(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-skip-rate-limit': 'true' },
          body: JSON.stringify({
            email: 'disabledcheck@srcodelab.space',
            password: 'Password123!',
            firstName: 'Disabled',
            lastName: 'User',
          }),
        },
        env
      );

      const accessCookie = extractCookie(regRes, 'sr_access')!;
      const refreshCookie = extractCookie(regRes, 'sr_refresh')!;

      // Disable user in database
      const db = createDb(env.DB);
      await db.update(users).set({ status: 'INACTIVE' }).where(eq(users.email, 'disabledcheck@srcodelab.space'));

      // /me must reject with 403 AUTH_FORBIDDEN
      const meRes = await app.request(
        '/api/v1/auth/me',
        {
          method: 'GET',
          headers: { Cookie: `sr_access=${accessCookie}` },
        },
        env
      );
      expect(meRes.status).toBe(403);
      const meBody = (await meRes.json()) as any;
      expect(meBody.error.code).toBe('AUTH_FORBIDDEN');

      // /refresh must also reject with 403 AUTH_FORBIDDEN
      const refreshRes = await app.request(
        '/api/v1/auth/refresh',
        {
          method: 'POST',
          headers: { Cookie: `sr_refresh=${refreshCookie}`, 'x-skip-rate-limit': 'true' },
        },
        env
      );
      expect(refreshRes.status).toBe(403);
      const refreshBody = (await refreshRes.json()) as any;
      expect(refreshBody.error.code).toBe('AUTH_FORBIDDEN');
    });

    it('should verify cookie attributes (Path, HttpOnly, SameSite)', async () => {
      const res = await app.request(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-skip-rate-limit': 'true' },
          body: JSON.stringify({
            email: 'cookieattrs@srcodelab.space',
            password: 'Password123!',
            firstName: 'Cookie',
            lastName: 'Tester',
          }),
        },
        env
      );

      const setCookies = getSetCookieHeaders(res);
      const accessCookieStr = setCookies.find((c) => c.includes('sr_access='));
      const refreshCookieStr = setCookies.find((c) => c.includes('sr_refresh='));

      expect(accessCookieStr).toBeDefined();
      expect(refreshCookieStr).toBeDefined();

      // Access cookie attributes
      expect(accessCookieStr?.toLowerCase()).toContain('httponly');
      expect(accessCookieStr?.toLowerCase()).toContain('samesite=lax');
      expect(accessCookieStr?.toLowerCase()).toContain('path=/');

      // Refresh cookie attributes - path must be scoped to /api/v1/auth
      expect(refreshCookieStr?.toLowerCase()).toContain('httponly');
      expect(refreshCookieStr?.toLowerCase()).toContain('samesite=lax');
      expect(refreshCookieStr?.toLowerCase()).toContain('path=/api/v1/auth');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. CSRF Defense Verification                                               */
  /* -------------------------------------------------------------------------- */
  describe('3. CSRF Protection Verification', () => {
    it('should reject state-changing requests with sec-fetch-site: cross-site', async () => {
      const res = await app.request(
        '/api/v1/auth/logout',
        {
          method: 'POST',
          headers: {
            'sec-fetch-site': 'cross-site',
          },
        },
        env
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('CSRF_FORBIDDEN');
    });

    it('should reject state-changing requests with untrusted Origin header', async () => {
      const res = await app.request(
        '/api/v1/auth/logout',
        {
          method: 'POST',
          headers: {
            Origin: 'https://attacker-phishing-site.com',
          },
        },
        env
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('CSRF_FORBIDDEN');
    });

    it('should reject localhost origin when APP_ENV is production', async () => {
      const prodEnv: Bindings = {
        ...env,
        APP_ENV: 'production',
      };

      const res = await app.request(
        '/api/v1/auth/logout',
        {
          method: 'POST',
          headers: {
            Origin: 'http://localhost:3000',
          },
        },
        prodEnv
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('CSRF_FORBIDDEN');
    });

    it('should allow valid production origin in production', async () => {
      const prodEnv: Bindings = {
        ...env,
        APP_ENV: 'production',
      };

      const res = await app.request(
        '/api/v1/auth/logout',
        {
          method: 'POST',
          headers: {
            Origin: 'https://workspace.srcodelab.space',
          },
        },
        prodEnv
      );

      expect(res.status).toBe(200);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Multi-Tenant Inactive Membership Verification                           */
  /* -------------------------------------------------------------------------- */
  describe('4. Tenant Inactive Membership Verification', () => {
    it('should reject access when user tenant membership is INACTIVE', async () => {
      const db = createDb(env.DB);
      const userId = crypto.randomUUID();
      const tenantId = crypto.randomUUID();
      const roleId = crypto.randomUUID();

      // Create active user
      await db.insert(users).values({
        id: userId,
        email: 'inactivemem@srcodelab.space',
        passwordHash: 'hash',
        firstName: 'Inactive',
        lastName: 'Member',
        status: 'ACTIVE',
      });

      // Create active tenant
      await db.insert(tenants).values({
        id: tenantId,
        name: 'Target Company',
        slug: 'target-company',
        status: 'ACTIVE',
      });

      // User membership in tenant is INACTIVE (e.g. revoked or suspended employee)
      await db.insert(userTenants).values({
        userId,
        tenantId,
        isDefault: true,
        status: 'INACTIVE',
      });

      await db.insert(roles).values({
        id: roleId,
        tenantId,
        name: 'Employee',
        code: 'EMPLOYEE',
        roleType: 'CUSTOM',
      });

      await db.insert(userRoles).values({
        userId,
        roleId,
        tenantId,
      });

      // Generate access token for this user
      const accessToken = await signAccessToken(
        { sub: userId, email: 'inactivemem@srcodelab.space', tenantId, roles: ['EMPLOYEE'] },
        JWT_SECRET
      );

      // Attempt to access tenant data
      const res = await app.request(
        '/api/v1/users',
        {
          method: 'GET',
          headers: {
            Cookie: `sr_access=${accessToken}`,
            'X-Tenant-Id': tenantId,
          },
        },
        env
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('TENANT_ACCESS_DENIED');
    });
  });
});
