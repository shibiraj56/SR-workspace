import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { createTestD1Database } from './mock-d1';
import {
  createDb,
  users,
  tenants,
  userTenants,
  roles,
  userRoles,
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import type { Bindings } from '../src/types/env';

describe('Multi-Tenant Isolation & Security', () => {
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

  async function createTenantAndUser(options: {
    email: string;
    tenantName: string;
    tenantSlug: string;
    isSuperAdmin?: boolean;
    tenantStatus?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  }) {
    const db = createDb(env.DB);
    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const roleId = crypto.randomUUID();

    const passwordHash = await hashPassword('TestPassword123!');

    await db.insert(users).values({
      id: userId,
      email: options.email,
      passwordHash,
      firstName: 'Test',
      lastName: 'User',
      status: 'ACTIVE',
      emailVerified: true,
    });

    await db.insert(tenants).values({
      id: tenantId,
      name: options.tenantName,
      slug: options.tenantSlug,
      status: options.tenantStatus || 'ACTIVE',
      plan: 'STARTER',
    });

    await db.insert(userTenants).values({
      userId,
      tenantId,
      isDefault: true,
      status: 'ACTIVE',
    });

    await db.insert(roles).values({
      id: roleId,
      tenantId,
      name: options.isSuperAdmin ? 'Super Administrator' : 'Standard Employee',
      code: options.isSuperAdmin ? 'SUPER_ADMIN' : 'EMPLOYEE',
      roleType: options.isSuperAdmin ? 'SYSTEM' : 'CUSTOM',
    });

    await db.insert(userRoles).values({
      userId,
      roleId,
      tenantId,
    });

    // Login to get session
    const loginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: options.email,
          password: 'TestPassword123!',
        }),
      },
      env
    );

    const accessCookie = extractCookie(loginRes, 'sr_access')!;
    return { userId, tenantId, accessCookie };
  }

  it('should allow user to access their own validated tenant workspace', async () => {
    const tenantA = await createTenantAndUser({
      email: 'usera@org-a.com',
      tenantName: 'Acme Corp',
      tenantSlug: 'acme-corp',
    });

    const res = await app.request(
      '/api/v1/users',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.users.length).toBe(1);
    expect(body.data.users[0].email).toBe('usera@org-a.com');
  });

  it('should REJECT cross-tenant access when a user attempts to access another tenant', async () => {
    // Tenant A
    const tenantA = await createTenantAndUser({
      email: 'usera@org-a.com',
      tenantName: 'Acme Corp',
      tenantSlug: 'acme-corp',
    });

    // Tenant B
    const tenantB = await createTenantAndUser({
      email: 'userb@org-b.com',
      tenantName: 'Beta Industries',
      tenantSlug: 'beta-ind',
    });

    // User A attempts to access Tenant B's data
    const res = await app.request(
      '/api/v1/users',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId, // Requesting Tenant B with User A's token!
        },
      },
      env
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('TENANT_ACCESS_DENIED');
  });

  it('should return 404 when target tenant does not exist', async () => {
    const tenantA = await createTenantAndUser({
      email: 'usera@org-a.com',
      tenantName: 'Acme Corp',
      tenantSlug: 'acme-corp',
    });

    const nonExistentId = crypto.randomUUID();
    const res = await app.request(
      '/api/v1/users',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': nonExistentId,
        },
      },
      env
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('TENANT_NOT_FOUND');
  });

  it('should return 403 when target tenant is suspended / inactive', async () => {
    const tenantA = await createTenantAndUser({
      email: 'usera@org-a.com',
      tenantName: 'Suspended Corp',
      tenantSlug: 'suspended-corp',
      tenantStatus: 'SUSPENDED',
    });

    const res = await app.request(
      '/api/v1/users',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
      },
      env
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('TENANT_INACTIVE');
  });

  it('should enforce strict data scoping (only returns users in active tenant)', async () => {
    const tenantA = await createTenantAndUser({
      email: 'usera@org-a.com',
      tenantName: 'Acme Corp',
      tenantSlug: 'acme-corp',
    });

    await createTenantAndUser({
      email: 'userb@org-b.com',
      tenantName: 'Beta Industries',
      tenantSlug: 'beta-ind',
    });

    const res = await app.request(
      '/api/v1/users',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
      },
      env
    );

    const body = (await res.json()) as any;
    expect(body.data.users.length).toBe(1);
    expect(body.data.users[0].email).toBe('usera@org-a.com');

    // Tenant B's user must NOT leak into Tenant A's listing
    const emails = body.data.users.map((u: any) => u.email);
    expect(emails).not.toContain('userb@org-b.com');
  });
});
