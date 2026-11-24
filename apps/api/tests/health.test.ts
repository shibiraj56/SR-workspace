import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { createTestD1Database } from './mock-d1';
import type { Bindings } from '../src/types/env';

describe('Health Check API (GET /api/v1/health)', () => {
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

  it('should return 200 OK and healthy status with live D1 connectivity', async () => {
    const res = await app.request('/api/v1/health', { method: 'GET' }, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
    expect(body.data.version).toBe('1.0.0');
    expect(body.data.database.status).toBe('connected');
    expect(typeof body.data.database.latencyMs).toBe('number');
    expect(body.meta.requestId).toBeDefined();
  });

  it('should not expose database credentials or secrets in health response', async () => {
    const res = await app.request('/api/v1/health', { method: 'GET' }, env);
    const text = await res.text();

    expect(text).not.toContain('test-secret');
    expect(text).not.toContain('password');
    expect(text).not.toContain('token');
  });
});
