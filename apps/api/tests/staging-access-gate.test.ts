import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { createTestD1Database } from './mock-d1';
import { onRequest as proxyOnRequest } from '../../web/functions/api/v1/[[path]]';

describe('Staging Layer 2 Security Suite: API Proxy & Worker Guard', () => {
  let app: ReturnType<typeof createApp>;
  let rawDb: any;

  const TEST_PROXY_SECRET = 'staging-server-to-server-proxy-secret-32-chars!';
  const CANONICAL_ORIGIN = 'https://staging-workspace.srcodelab.space';

  const workerStagingEnv = (overrides = {}) => ({
    DB: rawDb,
    APP_ENV: 'staging',
    APP_NAME: 'SR WORKSPACE API (Staging)',
    APP_ORIGIN: CANONICAL_ORIGIN,
    JWT_SECRET: 'test-jwt-secret-minimum-32-characters!',
    STAGING_PROXY_SECRET: TEST_PROXY_SECRET,
    ...overrides,
  });

  const workerProdEnv = (overrides = {}) => ({
    DB: rawDb,
    APP_ENV: 'production',
    APP_NAME: 'SR WORKSPACE API',
    APP_ORIGIN: 'https://workspace.srcodelab.space',
    JWT_SECRET: 'test-jwt-secret-minimum-32-characters!',
    ...overrides,
  });

  beforeEach(() => {
    rawDb = createTestD1Database();
    app = createApp();
  });

  // ==========================================
  // 1. FAIL-CLOSED ON MISSING PROXY SECRETS
  // ==========================================
  describe('1. Fail-Closed on Missing Proxy Secrets', () => {
    it('1.1 should return 500 when STAGING_PROXY_SECRET is missing in Pages proxy', async () => {
      const req = new Request(`${CANONICAL_ORIGIN}/api/v1/health`);
      const context: any = {
        request: req,
        functionPath: '/api/v1',
        waitUntil: () => {},
        next: async () => new Response('Fallback'),
        env: {
          API_UPSTREAM_URL: 'https://sr-workspace-api-staging.srcodelabs.workers.dev',
          // STAGING_PROXY_SECRET is intentionally missing
        },
        params: {},
        data: {},
      };

      const res = await proxyOnRequest(context);
      expect(res.status).toBe(500);
      const json = await res.json() as any;
      expect(json.error.code).toBe('PROXY_MISCONFIGURED');
    });

    it('1.2 should return 500 when STAGING_PROXY_SECRET is missing in staging Worker', async () => {
      const res = await app.request('/api/v1/health', {
        headers: {
          'x-staging-proxy-secret': TEST_PROXY_SECRET,
        },
      }, workerStagingEnv({ STAGING_PROXY_SECRET: undefined }));

      expect(res.status).toBe(500);
      const json = await res.json() as any;
      expect(json.error.code).toBe('PROXY_GUARD_MISCONFIGURED');
    });
  });

  // ==========================================
  // 2. PAGES PROXY SECRET INJECTION & OVERWRITE
  // ==========================================
  describe('2. Pages Proxy Secret Injection & Overwrite', () => {
    it('2.1 should unconditionally overwrite client-supplied x-staging-proxy-secret', async () => {
      let forwardedProxySecret: string | null = null;

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (input: any, init?: any) => {
          const headers = new Headers(init?.headers);
          forwardedProxySecret = headers.get('x-staging-proxy-secret');
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }) as any;

        const req = new Request(`${CANONICAL_ORIGIN}/api/v1/health`, {
          headers: {
            'x-staging-proxy-secret': 'spoofed-client-attempt',
          },
        });

        const context: any = {
          request: req,
          functionPath: '/api/v1',
          waitUntil: () => {},
          next: async () => new Response('Fallback'),
          env: {
            API_UPSTREAM_URL: 'https://sr-workspace-api-staging.srcodelabs.workers.dev',
            STAGING_PROXY_SECRET: TEST_PROXY_SECRET,
          },
          params: {},
          data: {},
        };

        const res = await proxyOnRequest(context);
        expect(res.status).toBe(200);
        // Verify proxy overwrote the spoofed header with the genuine secret
        expect(forwardedProxySecret).toBe(TEST_PROXY_SECRET);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ==========================================
  // 3. STAGING WORKER GUARD REJECTION & BYPASS
  // ==========================================
  describe('3. Staging Worker Guard Rejection and Bypass', () => {
    it('3.1 should reject direct worker requests without proxy secret with 403', async () => {
      const res = await app.request('/api/v1/health', {
        method: 'GET',
      }, workerStagingEnv());

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.error.code).toBe('FORBIDDEN_DIRECT_ACCESS');
    });

    it('3.2 should reject direct worker requests with wrong proxy secret with 403', async () => {
      const res = await app.request('/api/v1/health', {
        method: 'GET',
        headers: {
          'x-staging-proxy-secret': 'incorrect-secret-value',
        },
      }, workerStagingEnv());

      expect(res.status).toBe(403);
    });

    it('3.3 should reject direct calls to protected auth endpoints without secret', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': CANONICAL_ORIGIN,
        },
        body: JSON.stringify({ email: 'user@staging.com', password: 'Password123!' }),
      }, workerStagingEnv());

      expect(res.status).toBe(403);
    });

    it('3.4 should allow direct requests with valid proxy secret', async () => {
      const res = await app.request('/api/v1/health', {
        method: 'GET',
        headers: {
          'x-staging-proxy-secret': TEST_PROXY_SECRET,
        },
      }, workerStagingEnv());

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.status).toBe('healthy');
    });

    it('3.5 should permit OPTIONS preflight as the sole intentional bypass without proxy secret', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'OPTIONS',
        headers: {
          'Origin': CANONICAL_ORIGIN,
          'Access-Control-Request-Method': 'POST',
        },
      }, workerStagingEnv());

      // OPTIONS must succeed without 403
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(CANONICAL_ORIGIN);
    });

    it('3.6 should completely bypass proxy guard when APP_ENV is production', async () => {
      // In production, direct requests without proxy secret must not be blocked by staging guard
      const res = await app.request('/api/v1/health', {
        method: 'GET',
      }, workerProdEnv());

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.data.status).toBe('healthy');
    });
  });
});
