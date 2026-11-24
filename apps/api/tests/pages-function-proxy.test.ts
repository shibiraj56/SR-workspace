import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createApp } from '../src/app';
import { createTestD1Database } from './mock-d1';
import { createDb } from '@sr-workspace/database';
import { users, tenants, userTenants, roles, userRoles, employees } from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import { clearRateLimitStore } from '../src/middleware/rate-limiter';
import { onRequest } from '../../web/functions/api/v1/[[path]]';

describe('Cloudflare Pages Functions Same-Origin API Proxy Tests', () => {
  let app: ReturnType<typeof createApp>;
  let rawDb: any;
  let tenantId: string;
  let testUserId: string;

  const STAGING_ORIGIN = 'https://staging-workspace.srcodelab.space';
  const STAGING_UPSTREAM = 'https://sr-workspace-api-staging.srcodelabs.workers.dev';
  const STAGING_JWT_SECRET = 'staging-cryptographic-jwt-secret-minimum-32-characters!';
  const STAGING_PROXY_SECRET = 'staging-cryptographic-proxy-secret-32-characters!';

  const stagingEnv = () => ({
    DB: rawDb,
    APP_ENV: 'staging',
    APP_NAME: 'SR WORKSPACE API (Staging)',
    APP_ORIGIN: STAGING_ORIGIN,
    JWT_SECRET: STAGING_JWT_SECRET,
    STAGING_PROXY_SECRET,
  });

  beforeEach(async () => {
    clearRateLimitStore();
    rawDb = createTestD1Database();
    app = createApp();

    const db = createDb(rawDb);
    tenantId = crypto.randomUUID();
    testUserId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const employeeId = crypto.randomUUID();
    const passwordHash = await hashPassword('Password123!');

    await db.insert(tenants).values({ id: tenantId, name: 'Staging Tenant', slug: 'staging', status: 'ACTIVE' });
    await db.insert(users).values({
      id: testUserId,
      email: 'user@staging-workspace.srcodelab.space',
      passwordHash,
      firstName: 'Staging',
      lastName: 'User',
      status: 'ACTIVE',
      emailVerified: true,
    });
    await db.insert(userTenants).values({
      id: crypto.randomUUID(),
      userId: testUserId,
      tenantId,
      isDefault: true,
      status: 'ACTIVE',
    });
    await db.insert(roles).values({
      id: roleId,
      tenantId,
      name: 'EMPLOYEE',
      code: 'EMPLOYEE',
      roleType: 'SYSTEM',
    });
    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      userId: testUserId,
      roleId,
      tenantId,
    });
    await db.insert(employees).values({
      id: employeeId,
      tenantId,
      userId: testUserId,
      employeeCode: 'EMP-STG-001',
      firstName: 'Staging',
      lastName: 'User',
      workEmail: 'user@staging-workspace.srcodelab.space',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      joiningDate: new Date('2025-01-01'),
    });
  });

  /**
   * Helper to execute the Pages Function proxy with global fetch routed to our Hono app
   */
  async function executeProxy(
    incomingRequest: Request,
    customFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  ): Promise<Response> {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (customFetch || (async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlObj = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
        const relativePath = `${urlObj.pathname}${urlObj.search}`;
        return app.request(relativePath, init, stagingEnv());
      })) as any;

      const context: any = {
        request: incomingRequest,
        functionPath: '/api/v1',
        waitUntil: () => {},
        next: async () => new Response('Fallback', { status: 404 }),
        env: {
          API_UPSTREAM_URL: STAGING_UPSTREAM,
          STAGING_PROXY_SECRET,
        },
        params: {},
        data: {},
      };

      return await onRequest(context);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // ==========================================
  // 1. HEALTH CHECK THROUGH PROXY
  // ==========================================
  it('1. should proxy GET /api/v1/health successfully with no-store caching', async () => {
    const req = new Request(`${STAGING_ORIGIN}/api/v1/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const res = await executeProxy(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('healthy');
    expect(json.data.database.status).toBe('connected');

    // Verify non-caching headers enforced by proxy
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('pragma')).toBe('no-cache');
    expect(res.headers.get('expires')).toBe('0');
  });

  // ==========================================
  // 2. LOGIN AND MULTIPLE COOKIE PROPAGATION
  // ==========================================
  it('2. should login and preserve both sr_access and sr_refresh Set-Cookie headers', async () => {
    const req = new Request(`${STAGING_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': STAGING_ORIGIN,
        'x-skip-rate-limit': 'true',
      },
      body: JSON.stringify({
        email: 'user@staging-workspace.srcodelab.space',
        password: 'Password123!',
      }),
    });

    const res = await executeProxy(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe('user@staging-workspace.srcodelab.space');

    // Verify multiple Set-Cookie headers preserved
    const getSetCookie = (res.headers as any).getSetCookie?.() || [];
    const rawSetCookie = res.headers.get('set-cookie') || '';
    const cookieString = getSetCookie.length > 0 ? getSetCookie.join('; ') : rawSetCookie;

    expect(cookieString).toContain('sr_access=');
    expect(cookieString).toContain('sr_refresh=');
    expect(cookieString.toLowerCase()).toContain('httponly');
    expect(cookieString.toLowerCase()).toContain('samesite=lax');
  });

  // ==========================================
  // 3. AUTHENTICATED REQUEST THROUGH PROXY
  // ==========================================
  it('3. should forward session cookie and succeed on authenticated endpoint', async () => {
    // Perform login first to obtain token
    const loginReq = new Request(`${STAGING_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': STAGING_ORIGIN,
        'x-skip-rate-limit': 'true',
      },
      body: JSON.stringify({
        email: 'user@staging-workspace.srcodelab.space',
        password: 'Password123!',
      }),
    });
    const loginRes = await executeProxy(loginReq);
    expect(loginRes.status).toBe(200);

    const setCookies = (loginRes.headers as any).getSetCookie?.() || [loginRes.headers.get('set-cookie') || ''];
    let accessCookie = '';
    for (const c of setCookies) {
      if (c.includes('sr_access=')) {
        accessCookie = c.split(';')[0].trim();
      }
    }
    expect(accessCookie).toBeTruthy();

    // Authenticated request to /api/v1/auth/me
    const meReq = new Request(`${STAGING_ORIGIN}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        'Cookie': accessCookie,
        'X-Tenant-Id': tenantId,
      },
    });

    const meRes = await executeProxy(meReq);
    expect(meRes.status).toBe(200);

    const meJson = (await meRes.json()) as any;
    expect(meJson.success).toBe(true);
    expect(meJson.data.user.id).toBe(testUserId);
  });

  // ==========================================
  // 4. SESSION REFRESH THROUGH PROXY
  // ==========================================
  it('4. should refresh session and return new credentials via proxy', async () => {
    // Login
    const loginReq = new Request(`${STAGING_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': STAGING_ORIGIN,
        'x-skip-rate-limit': 'true',
      },
      body: JSON.stringify({
        email: 'user@staging-workspace.srcodelab.space',
        password: 'Password123!',
      }),
    });
    const loginRes = await executeProxy(loginReq);
    const setCookies = (loginRes.headers as any).getSetCookie?.() || [loginRes.headers.get('set-cookie') || ''];
    let refreshCookie = '';
    for (const c of setCookies) {
      if (c.includes('sr_refresh=')) {
        refreshCookie = c.split(';')[0].trim();
      }
    }
    expect(refreshCookie).toBeTruthy();

    // Refresh request to /api/v1/auth/refresh
    const refreshReq = new Request(`${STAGING_ORIGIN}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Cookie': refreshCookie,
        'Origin': STAGING_ORIGIN,
      },
    });

    const refreshRes = await executeProxy(refreshReq);
    expect(refreshRes.status).toBe(200);

    const refCookies = (refreshRes.headers as any).getSetCookie?.() || [refreshRes.headers.get('set-cookie') || ''];
    const refString = refCookies.join('; ');
    expect(refString).toContain('sr_access=');
    expect(refString).toContain('sr_refresh=');
  });

  // ==========================================
  // 5. LOGOUT AND COOKIE CLEARING THROUGH PROXY
  // ==========================================
  it('5. should logout and issue cookie deletion headers through proxy', async () => {
    const logoutReq = new Request(`${STAGING_ORIGIN}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Origin': STAGING_ORIGIN,
      },
    });

    const logoutRes = await executeProxy(logoutReq);
    expect(logoutRes.status).toBe(200);

    const logoutCookies = (logoutRes.headers as any).getSetCookie?.() || [logoutRes.headers.get('set-cookie') || ''];
    const logoutString = logoutCookies.join('; ');
    expect(logoutString).toContain('Max-Age=0');
  });

  // ==========================================
  // 6. UNTRUSTED ORIGIN REJECTION
  // ==========================================
  it('6. should preserve untrusted Origin header and trigger 403 CSRF rejection', async () => {
    const untrustedOrigin = 'https://malicious-attacker-phishing.com';
    const req = new Request(`${STAGING_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': untrustedOrigin,
      },
      body: JSON.stringify({
        email: 'user@staging-workspace.srcodelab.space',
        password: 'Password123!',
      }),
    });

    const res = await executeProxy(req);
    expect(res.status).toBe(403);

    const json = (await res.json()) as any;
    expect(json.error.code).toBe('CSRF_FORBIDDEN');
  });

  // ==========================================
  // 7. PREFLIGHT OPTIONS HANDLING
  // ==========================================
  it('7. should forward OPTIONS preflight and return CORS response headers', async () => {
    const optionsReq = new Request(`${STAGING_ORIGIN}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': STAGING_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    const res = await executeProxy(optionsReq);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(STAGING_ORIGIN);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  // ==========================================
  // 8. UPSTREAM UNAVAILABLE / GATEWAY ERROR HANDLING
  // ==========================================
  it('8. should return 502 UPSTREAM_GATEWAY_ERROR when upstream network fails', async () => {
    const brokenFetch = async () => {
      throw new Error('Connection refused by upstream target');
    };

    const req = new Request(`${STAGING_ORIGIN}/api/v1/health`, {
      method: 'GET',
    });

    const res = await executeProxy(req, brokenFetch);
    expect(res.status).toBe(502);

    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UPSTREAM_GATEWAY_ERROR');
    expect(json.error.message).toBe('The upstream API service is temporarily unavailable.');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  // ==========================================
  // 9. HOP-BY-HOP AND CLIENT FORWARDING HEADERS STRIPPING
  // ==========================================
  it('9. should strip hop-by-hop and client-controlled forwarding headers before forwarding to upstream', async () => {
    let capturedHeaders: Headers | undefined;

    const spyFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const req = new Request(`${STAGING_ORIGIN}/api/v1/health`, {
      method: 'GET',
      headers: {
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=5',
        'Transfer-Encoding': 'chunked',
        'Upgrade': 'websocket',
        'X-Forwarded-Host': 'spoofed-attacker-host.com',
        'X-Forwarded-Proto': 'http',
        'User-Agent': 'ValidBrowser/1.0',
      },
    });

    await executeProxy(req, spyFetch);

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!.get('connection')).toBeNull();
    expect(capturedHeaders!.get('keep-alive')).toBeNull();
    expect(capturedHeaders!.get('transfer-encoding')).toBeNull();
    expect(capturedHeaders!.get('upgrade')).toBeNull();
    // Verify client-spoofed headers were overwritten with actual values
    expect(capturedHeaders!.get('x-forwarded-host')).toBe('staging-workspace.srcodelab.space');
    expect(capturedHeaders!.get('x-forwarded-proto')).toBe('https');
    expect(capturedHeaders!.get('user-agent')).toBe('ValidBrowser/1.0');
    expect(capturedHeaders!.get('host')).toBe('sr-workspace-api-staging.srcodelabs.workers.dev');
  });
});
