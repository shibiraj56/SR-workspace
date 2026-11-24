import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { createTestD1Database } from './mock-d1';
import { clearRateLimitStore } from '../src/middleware/rate-limiter';
import {
  createDb,
  users,
  tenants,
  userTenants,
  roles,
  userRoles,
  departments,
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import type { Bindings } from '../src/types/env';

/**
 * Normalization helper replica to verify frontend extraction contract in regression test.
 */
function extractItems<T>(response: unknown): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (typeof response === 'object') {
    const obj = response as Record<string, any>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.data)) return obj.data;
    if (obj.data && typeof obj.data === 'object' && Array.isArray(obj.data.items)) {
      return obj.data.items;
    }
  }
  return [];
}

describe('Departments Response Contract & Frontend Regression Tests', () => {
  let app: ReturnType<typeof createApp>;
  let env: Bindings;

  beforeEach(() => {
    clearRateLimitStore();
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

  async function createTestTenant(slug = 'test-co') {
    const db = createDb(env.DB);
    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const passwordHash = await hashPassword('Password123!');

    await db.insert(users).values({
      id: userId,
      email: `${slug}@example.com`,
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      status: 'ACTIVE',
      emailVerified: true,
    });

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Test Tenant',
      slug,
      status: 'ACTIVE',
      plan: 'STARTER',
    });

    await db.insert(userTenants).values({
      id: crypto.randomUUID(),
      userId,
      tenantId,
      isDefault: true,
      status: 'ACTIVE',
    });

    await db.insert(roles).values({
      id: roleId,
      tenantId,
      name: 'Tenant Admin',
      code: 'TENANT_ADMIN',
      roleType: 'SYSTEM',
    });

    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      userId,
      roleId,
      tenantId,
    });

    const loginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-skip-rate-limit': 'true',
        },
        body: JSON.stringify({
          email: `${slug}@example.com`,
          password: 'Password123!',
        }),
      },
      env
    );

    const accessCookie = extractCookie(loginRes, 'sr_access')!;
    return { userId, tenantId, accessCookie };
  }

  it('Departments API returns a valid wrapped pagination object with items array', async () => {
    const { tenantId, accessCookie } = await createTestTenant('dept-contract');

    // Create a department
    const db = createDb(env.DB);
    await db.insert(departments).values({
      id: crypto.randomUUID(),
      tenantId,
      name: 'Human Resources',
      code: 'HR',
      status: 'ACTIVE',
    });

    const res = await app.request(
      '/api/v1/departments?pageSize=100',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;

    // Verify envelope contract
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(typeof json.data).toBe('object');
    expect(Array.isArray(json.data.items)).toBe(true);
    expect(json.data.items.length).toBe(1);
    expect(json.data.items[0].name).toBe('Human Resources');
    expect(json.data.total).toBe(1);
    expect(json.data.page).toBe(1);
    expect(json.data.pageSize).toBe(100);
    expect(json.data.totalPages).toBe(1);

    // Verify normalization utility extracts the array properly
    const extracted = extractItems(json.data);
    expect(Array.isArray(extracted)).toBe(true);
    expect(extracted.length).toBe(1);

    // Verify dropdown map works without runtime TypeError
    const options = extracted.map((d: any) => ({ value: d.id, label: d.name }));
    expect(options.length).toBe(1);
    expect(options[0].label).toBe('Human Resources');
  });

  it('Departments API returns empty items array when no departments exist', async () => {
    const { tenantId, accessCookie } = await createTestTenant('dept-empty');

    const res = await app.request(
      '/api/v1/departments?pageSize=100',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.items)).toBe(true);
    expect(json.data.items.length).toBe(0);
    expect(json.data.total).toBe(0);

    // Extraction handles empty array gracefully
    const extracted = extractItems(json.data);
    expect(Array.isArray(extracted)).toBe(true);
    expect(extracted.length).toBe(0);

    // Dropdown render produces empty array without error
    const rendered = extracted.map((d: any) => d.name);
    expect(rendered).toEqual([]);
  });

  it('extractItems safely handles malformed, null, undefined or direct array responses', () => {
    // 1. Null / undefined / false
    expect(extractItems(null)).toEqual([]);
    expect(extractItems(undefined)).toEqual([]);
    expect(extractItems(false)).toEqual([]);
    expect(extractItems(123)).toEqual([]);
    expect(extractItems('not-an-array')).toEqual([]);

    // 2. Direct array
    const directArray = [{ id: '1', name: 'Engineering' }];
    expect(extractItems(directArray)).toEqual(directArray);

    // 3. Paginated envelope: { items: [...] }
    const paginated = { items: [{ id: '2', name: 'Marketing' }], total: 1 };
    expect(extractItems(paginated)).toEqual(paginated.items);

    // 4. Raw API envelope: { data: [...] }
    const rawEnvelope = { data: [{ id: '3', name: 'Finance' }] };
    expect(extractItems(rawEnvelope)).toEqual(rawEnvelope.data);

    // 5. Nested paginated envelope: { data: { items: [...] } }
    const nestedEnvelope = { data: { items: [{ id: '4', name: 'Design' }] } };
    expect(extractItems(nestedEnvelope)).toEqual(nestedEnvelope.data.items);

    // 6. Empty object or corrupted payload
    expect(extractItems({})).toEqual([]);
    expect(extractItems({ data: null })).toEqual([]);
    expect(extractItems({ items: null })).toEqual([]);

    // 7. Simulating dropdown mapping over extractItems output
    const safeMapResult = extractItems(nestedEnvelope).map((d: any) => d.name);
    expect(safeMapResult).toEqual(['Design']);

    // 8. Simulating dropdown mapping over corrupted response (must NEVER throw TypeError)
    const corruptedResult = extractItems({ corrupted: true }).map((d: any) => d.name);
    expect(corruptedResult).toEqual([]);
  });

  it('Failed department request returns appropriate error without throwing in frontend', async () => {
    // Unauthenticated request
    const res = await app.request(
      '/api/v1/departments',
      {
        method: 'GET',
      },
      env
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();

    // Even if error response was passed to extractItems, it returns []
    const fallback = extractItems(json);
    expect(fallback).toEqual([]);
    expect(() => fallback.map((d: any) => d.name)).not.toThrow();
  });
});
