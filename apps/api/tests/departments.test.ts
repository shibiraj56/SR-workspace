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
  employees,
  auditLogs,
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import type { Bindings } from '../src/types/env';
import { eq, and } from 'drizzle-orm';

describe('Departments API Integration Tests', () => {
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

  async function createTenantAndUser(options: {
    email: string;
    tenantName: string;
    tenantSlug: string;
    roleCode?: string;
  }) {
    const db = createDb(env.DB);
    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const passwordHash = await hashPassword('TestPassword123!');

    await db.insert(users).values({
      id: userId,
      email: options.email.toLowerCase(),
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      status: 'ACTIVE',
      emailVerified: true,
    });

    await db.insert(tenants).values({
      id: tenantId,
      name: options.tenantName,
      slug: options.tenantSlug,
      status: 'ACTIVE',
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
      name: 'Tenant Admin',
      code: options.roleCode || 'TENANT_ADMIN',
      roleType: 'SYSTEM',
    });

    await db.insert(userRoles).values({
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
          email: options.email,
          password: 'TestPassword123!',
        }),
      },
      env
    );

    const accessCookie = extractCookie(loginRes, 'sr_access')!;
    return { userId, tenantId, accessCookie };
  }

  it('should create a department successfully with valid payload', async () => {
    const { tenantId, accessCookie } = await createTenantAndUser({
      email: 'admin@dept-test.com',
      tenantName: 'Dept Test Tenant',
      tenantSlug: 'dept-test',
    });

    const res = await app.request(
      '/api/v1/departments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          name: 'Engineering',
          code: 'ENG',
          description: 'Software Engineering and Product Architecture',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Engineering');
    expect(json.data.code).toBe('ENG');
    expect(json.data.tenantId).toBe(tenantId);
    expect(json.data.status).toBe('ACTIVE');

    // Verify audit log creation
    const db = createDb(env.DB);
    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.action, 'CREATE'), eq(auditLogs.entityType, 'department')));
    expect(logs.length).toBe(1);
    expect(logs[0].entityId).toBe(json.data.id);
  });

  it('should reject duplicate department code in same tenant', async () => {
    const { tenantId, accessCookie } = await createTenantAndUser({
      email: 'admin2@dept-test.com',
      tenantName: 'Dept Test Tenant 2',
      tenantSlug: 'dept-test-2',
    });

    // Create first department
    await app.request(
      '/api/v1/departments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({ name: 'Engineering', code: 'ENG' }),
      },
      env
    );

    // Try to create second department with same code
    const duplicateRes = await app.request(
      '/api/v1/departments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({ name: 'Engineering Duplicate', code: 'ENG' }),
      },
      env
    );

    expect(duplicateRes.status).toBe(409);
    const json = (await duplicateRes.json()) as any;
    expect(json.error.code).toBe('DEPARTMENT_CODE_EXISTS');
  });

  it('should allow same department code across different tenants', async () => {
    const tenantA = await createTenantAndUser({
      email: 'admin@tenant-a.com',
      tenantName: 'Tenant A',
      tenantSlug: 'tenant-a',
    });
    const tenantB = await createTenantAndUser({
      email: 'admin@tenant-b.com',
      tenantName: 'Tenant B',
      tenantSlug: 'tenant-b',
    });

    // Create in Tenant A
    const resA = await app.request(
      '/api/v1/departments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
        body: JSON.stringify({ name: 'HR Department', code: 'HR' }),
      },
      env
    );
    expect(resA.status).toBe(201);

    // Create in Tenant B with same code 'HR'
    const resB = await app.request(
      '/api/v1/departments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantB.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId,
        },
        body: JSON.stringify({ name: 'Human Resources', code: 'HR' }),
      },
      env
    );
    expect(resB.status).toBe(201);
  });

  it('should list departments and return accurate employee counts', async () => {
    const { tenantId, accessCookie } = await createTenantAndUser({
      email: 'admin3@dept-test.com',
      tenantName: 'Dept Test Tenant 3',
      tenantSlug: 'dept-test-3',
    });
    const db = createDb(env.DB);

    // Create department
    const deptRes = await app.request(
      '/api/v1/departments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({ name: 'Product', code: 'PROD' }),
      },
      env
    );
    const dept = ((await deptRes.json()) as any).data;

    // Direct insert 2 employees in that department
    await db.insert(employees).values([
      {
        id: crypto.randomUUID(),
        tenantId,
        departmentId: dept.id,
        employeeCode: 'EMP-001',
        firstName: 'Alice',
        lastName: 'Smith',
        workEmail: 'alice@prod.com',
        employmentType: 'FULL_TIME',
        employmentStatus: 'ACTIVE',
        joiningDate: new Date(),
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        departmentId: dept.id,
        employeeCode: 'EMP-002',
        firstName: 'Bob',
        lastName: 'Jones',
        workEmail: 'bob@prod.com',
        employmentType: 'FULL_TIME',
        employmentStatus: 'ACTIVE',
        joiningDate: new Date(),
      },
    ]);

    // Query departments list
    const listRes = await app.request(
      '/api/v1/departments',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
      },
      env
    );

    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as any;
    expect(listJson.data.items.length).toBe(1);
    expect(listJson.data.items[0].employeeCount).toBe(2);
  });

  it('should prevent deleting department with active assigned employees', async () => {
    const { tenantId, accessCookie } = await createTenantAndUser({
      email: 'admin4@dept-test.com',
      tenantName: 'Dept Test Tenant 4',
      tenantSlug: 'dept-test-4',
    });
    const db = createDb(env.DB);

    // Create department
    const deptRes = await app.request(
      '/api/v1/departments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({ name: 'Sales', code: 'SALES' }),
      },
      env
    );
    const dept = ((await deptRes.json()) as any).data;

    // Add employee to department
    const empId = crypto.randomUUID();
    await db.insert(employees).values({
      id: empId,
      tenantId,
      departmentId: dept.id,
      employeeCode: 'SALES-01',
      firstName: 'Charlie',
      lastName: 'Brown',
      workEmail: 'charlie@sales.com',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      joiningDate: new Date(),
    });

    // Attempt delete
    const deleteRes = await app.request(
      `/api/v1/departments/${dept.id}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
      },
      env
    );

    expect(deleteRes.status).toBe(400);
    const deleteJson = (await deleteRes.json()) as any;
    expect(deleteJson.error.code).toBe('DEPARTMENT_HAS_EMPLOYEES');

    // Now reassign employee away from department
    await db.update(employees).set({ departmentId: null }).where(eq(employees.id, empId));

    // Retry delete
    const retryRes = await app.request(
      `/api/v1/departments/${dept.id}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
      },
      env
    );

    expect(retryRes.status).toBe(200);
    const retryJson = (await retryRes.json()) as any;
    expect(retryJson.success).toBe(true);
  });

  it('should reject cross-tenant department access', async () => {
    const tenantA = await createTenantAndUser({
      email: 'adminA@tenant-iso.com',
      tenantName: 'Tenant Iso A',
      tenantSlug: 'tenant-iso-a',
    });
    const tenantB = await createTenantAndUser({
      email: 'adminB@tenant-iso.com',
      tenantName: 'Tenant Iso B',
      tenantSlug: 'tenant-iso-b',
    });

    // Create department in Tenant A
    const deptRes = await app.request(
      '/api/v1/departments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
        body: JSON.stringify({ name: 'Confidential', code: 'CONF' }),
      },
      env
    );
    const deptA = ((await deptRes.json()) as any).data;

    // Tenant B tries to retrieve Tenant A's department
    const getRes = await app.request(
      `/api/v1/departments/${deptA.id}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${tenantB.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId,
        },
      },
      env
    );

    expect(getRes.status).toBe(404);

    // Tenant B tries to delete Tenant A's department
    const deleteRes = await app.request(
      `/api/v1/departments/${deptA.id}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${tenantB.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId,
        },
      },
      env
    );

    expect(deleteRes.status).toBe(404);
  });
});
