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

describe('Employees API Integration Tests', () => {
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

  it('should create an employee successfully with valid payload', async () => {
    const { tenantId, accessCookie } = await createTenantAndUser({
      email: 'admin@emp-test.com',
      tenantName: 'Emp Test Tenant',
      tenantSlug: 'emp-test',
    });

    const res = await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          firstName: 'John',
          lastName: 'Doe',
          employeeCode: 'EMP-100',
          workEmail: 'john.doe@emp-test.com',
          jobTitle: 'Software Architect',
          employmentType: 'FULL_TIME',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.employeeCode).toBe('EMP-100');
    expect(json.data.firstName).toBe('John');
    expect(json.data.lastName).toBe('Doe');
    expect(json.data.workEmail).toBe('john.doe@emp-test.com');
    expect(json.data.employmentStatus).toBe('ACTIVE');
    expect(json.data.tenantId).toBe(tenantId);

    // Verify audit log
    const db = createDb(env.DB);
    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.action, 'CREATE'), eq(auditLogs.entityType, 'employee')));
    expect(logs.length).toBe(1);
    expect(logs[0].entityId).toBe(json.data.id);
  });

  it('should reject duplicate employee code in same tenant', async () => {
    const { tenantId, accessCookie } = await createTenantAndUser({
      email: 'admin2@emp-test.com',
      tenantName: 'Emp Test Tenant 2',
      tenantSlug: 'emp-test-2',
    });

    // Create first employee
    await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          firstName: 'John',
          lastName: 'Doe',
          employeeCode: 'EMP-DUP',
          workEmail: 'john1@emp-test.com',
        }),
      },
      env
    );

    // Try to create second with same code
    const dupRes = await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          firstName: 'Jane',
          lastName: 'Smith',
          employeeCode: 'EMP-DUP',
          workEmail: 'jane2@emp-test.com',
        }),
      },
      env
    );

    expect(dupRes.status).toBe(409);
    const json = (await dupRes.json()) as any;
    expect(json.error.code).toBe('EMPLOYEE_CODE_EXISTS');
  });

  it('should allow same employee code in different tenants', async () => {
    const tenantA = await createTenantAndUser({
      email: 'adminA@emp-cross.com',
      tenantName: 'Tenant A Emp',
      tenantSlug: 'tenant-a-emp',
    });
    const tenantB = await createTenantAndUser({
      email: 'adminB@emp-cross.com',
      tenantName: 'Tenant B Emp',
      tenantSlug: 'tenant-b-emp',
    });

    const resA = await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
        body: JSON.stringify({
          firstName: 'Employee',
          lastName: 'One',
          employeeCode: 'EMP-001',
          workEmail: 'one@tenant-a.com',
        }),
      },
      env
    );
    expect(resA.status).toBe(201);

    const resB = await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantB.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId,
        },
        body: JSON.stringify({
          firstName: 'Employee',
          lastName: 'Two',
          employeeCode: 'EMP-001',
          workEmail: 'two@tenant-b.com',
        }),
      },
      env
    );
    expect(resB.status).toBe(201);
  });

  it('should reject self-manager assignment (INVALID_MANAGER_HIERARCHY)', async () => {
    const { tenantId, accessCookie } = await createTenantAndUser({
      email: 'admin3@emp-test.com',
      tenantName: 'Emp Test Tenant 3',
      tenantSlug: 'emp-test-3',
    });

    // Create an employee
    const createRes = await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          firstName: 'Self',
          lastName: 'Manager',
          employeeCode: 'SELF-1',
          workEmail: 'self@test.com',
        }),
      },
      env
    );
    const emp = ((await createRes.json()) as any).data;

    // Try to update employee setting self as manager
    const updateRes = await app.request(
      `/api/v1/employees/${emp.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          managerEmployeeId: emp.id,
        }),
      },
      env
    );

    expect(updateRes.status).toBe(400);
    const updateJson = (await updateRes.json()) as any;
    expect(updateJson.error.code).toBe('INVALID_MANAGER_HIERARCHY');
  });

  it('should reject cross-tenant department assignment', async () => {
    const tenantA = await createTenantAndUser({
      email: 'adminA2@emp-iso.com',
      tenantName: 'Tenant Iso A2',
      tenantSlug: 'tenant-iso-a2',
    });
    const tenantB = await createTenantAndUser({
      email: 'adminB2@emp-iso.com',
      tenantName: 'Tenant Iso B2',
      tenantSlug: 'tenant-iso-b2',
    });
    const db = createDb(env.DB);

    // Create department in Tenant B
    const deptId = crypto.randomUUID();
    await db.insert(departments).values({
      id: deptId,
      tenantId: tenantB.tenantId,
      name: 'Tenant B Dept',
      code: 'B-DEPT',
      status: 'ACTIVE',
    });

    // Tenant A attempts to create employee referencing Tenant B's department
    const res = await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
        body: JSON.stringify({
          firstName: 'Cross',
          lastName: 'Dept',
          employeeCode: 'CROSS-1',
          workEmail: 'cross@dept.com',
          departmentId: deptId,
        }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('INVALID_DEPARTMENT');
  });

  it('should list employees with search and status filters', async () => {
    const { tenantId, accessCookie } = await createTenantAndUser({
      email: 'admin4@emp-test.com',
      tenantName: 'Emp Test Tenant 4',
      tenantSlug: 'emp-test-4',
    });

    // Create 3 employees
    await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          firstName: 'Alice',
          lastName: 'Johnson',
          employeeCode: 'EMP-ALICE',
          workEmail: 'alice@company.com',
        }),
      },
      env
    );

    await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          firstName: 'Bob',
          lastName: 'Smith',
          employeeCode: 'EMP-BOB',
          workEmail: 'bob@company.com',
        }),
      },
      env
    );

    // Search by name "alice"
    const searchRes = await app.request(
      '/api/v1/employees?search=alice',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
      },
      env
    );

    expect(searchRes.status).toBe(200);
    const searchJson = (await searchRes.json()) as any;
    expect(searchJson.data.items.length).toBe(1);
    expect(searchJson.data.items[0].employeeCode).toBe('EMP-ALICE');
  });

  it('should clean up department head and subordinate manager references upon deletion', async () => {
    const { tenantId, accessCookie } = await createTenantAndUser({
      email: 'admin5@emp-test.com',
      tenantName: 'Emp Test Tenant 5',
      tenantSlug: 'emp-test-5',
    });
    const db = createDb(env.DB);

    // Create a manager employee
    const mgrRes = await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          firstName: 'Manager',
          lastName: 'Boss',
          employeeCode: 'MGR-01',
          workEmail: 'boss@company.com',
        }),
      },
      env
    );
    const mgr = ((await mgrRes.json()) as any).data;

    // Create department headed by this manager
    const deptId = crypto.randomUUID();
    await db.insert(departments).values({
      id: deptId,
      tenantId,
      name: 'Operations',
      code: 'OPS',
      departmentHeadId: mgr.id,
      status: 'ACTIVE',
    });

    // Create subordinate employee managed by this manager
    const subRes = await app.request(
      '/api/v1/employees',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          firstName: 'Junior',
          lastName: 'Staff',
          employeeCode: 'STAFF-01',
          workEmail: 'staff@company.com',
          managerEmployeeId: mgr.id,
        }),
      },
      env
    );
    const sub = ((await subRes.json()) as any).data;

    // Delete the manager
    const delRes = await app.request(
      `/api/v1/employees/${mgr.id}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
      },
      env
    );
    expect(delRes.status).toBe(200);

    // Verify department head was cleared to null
    const [dept] = await db.select().from(departments).where(eq(departments.id, deptId));
    expect(dept.departmentHeadId).toBeNull();

    // Verify subordinate managerEmployeeId was cleared to null
    const [subUpdated] = await db.select().from(employees).where(eq(employees.id, sub.id));
    expect(subUpdated.managerEmployeeId).toBeNull();
  });
});
