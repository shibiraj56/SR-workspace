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
  projects,
  projectMembers,
  tasks,
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import type { Bindings } from '../src/types/env';

describe('Projects API Integration Tests', () => {
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

  async function setupTenant(options: {
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
      firstName: 'Project',
      lastName: 'Admin',
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
      code: options.roleCode || 'TENANT_ADMIN',
      roleType: 'SYSTEM',
    });

    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      userId,
      roleId,
      tenantId,
    });

    // Create an employee record for project assignment
    const employeeId = crypto.randomUUID();
    await db.insert(employees).values({
      id: employeeId,
      tenantId,
      userId,
      employeeCode: `EMP-${options.tenantSlug.toUpperCase().slice(0, 3)}-001`,
      firstName: 'Project',
      lastName: 'Lead',
      workEmail: options.email,
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      jobTitle: 'Project Manager',
      joiningDate: new Date('2025-01-01'),
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
    return { userId, tenantId, employeeId, accessCookie };
  }

  it('should create a project with valid payload and return 201', async () => {
    const { tenantId, employeeId, accessCookie } = await setupTenant({
      email: 'admin@projects.test',
      tenantName: 'Projects Inc',
      tenantSlug: 'proj-inc',
    });

    const res = await app.request(
      '/api/v1/projects',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          name: 'Core System Migration',
          projectCode: 'PRJ-CORE-001',
          description: 'Migrating to Cloudflare edge',
          ownerEmployeeId: employeeId,
          status: 'PLANNING',
          priority: 'HIGH',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('Core System Migration');
    expect(data.data.projectCode).toBe('PRJ-CORE-001');
    expect(data.data.ownerEmployeeId).toBe(employeeId);
    expect(data.data.tenantId).toBe(tenantId);
    expect(data.data.status).toBe('PLANNING');
  });

  it('should reject duplicate project code within the same tenant', async () => {
    const { tenantId, employeeId, accessCookie } = await setupTenant({
      email: 'admin@duptest.com',
      tenantName: 'Dup Test Co',
      tenantSlug: 'dup-co',
    });

    // Create first project
    await app.request(
      '/api/v1/projects',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          name: 'First Project',
          projectCode: 'PRJ-DUP-01',
          ownerEmployeeId: employeeId,
        }),
      },
      env
    );

    // Attempt second project with same code
    const res = await app.request(
      '/api/v1/projects',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          name: 'Second Project with Same Code',
          projectCode: 'PRJ-DUP-01',
          ownerEmployeeId: employeeId,
        }),
      },
      env
    );

    expect(res.status).toBe(409);
    const data = await res.json() as any;
    expect(data.error.code).toBe('PROJECT_CODE_EXISTS');
  });

  it('should allow identical project codes across different tenants', async () => {
    const tenantA = await setupTenant({
      email: 'admin@tenant-a.com',
      tenantName: 'Tenant A',
      tenantSlug: 'tenant-a',
    });

    const tenantB = await setupTenant({
      email: 'admin@tenant-b.com',
      tenantName: 'Tenant B',
      tenantSlug: 'tenant-b',
    });

    const code = 'PRJ-SHARED-CODE';

    const resA = await app.request(
      '/api/v1/projects',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
        body: JSON.stringify({
          name: 'Tenant A Project',
          projectCode: code,
          ownerEmployeeId: tenantA.employeeId,
        }),
      },
      env
    );
    expect(resA.status).toBe(201);

    const resB = await app.request(
      '/api/v1/projects',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantB.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId,
        },
        body: JSON.stringify({
          name: 'Tenant B Project',
          projectCode: code,
          ownerEmployeeId: tenantB.employeeId,
        }),
      },
      env
    );
    expect(resB.status).toBe(201);
  });

  it('should support project member management (add, list, remove)', async () => {
    const { tenantId, employeeId, accessCookie } = await setupTenant({
      email: 'lead@members.com',
      tenantName: 'Members Inc',
      tenantSlug: 'members-inc',
    });

    // Create another employee in tenant
    const db = createDb(env.DB);
    const secondEmpId = crypto.randomUUID();
    await db.insert(employees).values({
      id: secondEmpId,
      tenantId,
      employeeCode: 'EMP-SEC-002',
      firstName: 'Dev',
      lastName: 'Two',
      workEmail: 'dev2@members.com',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      jobTitle: 'Developer',
      joiningDate: new Date('2025-01-01'),
    });

    // Create project
    const projRes = await app.request(
      '/api/v1/projects',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          name: 'Team Project',
          projectCode: 'PRJ-TEAM-01',
          ownerEmployeeId: employeeId,
        }),
      },
      env
    );
    const projData = await projRes.json() as any;
    const projectId = projData.data.id;

    // Add member
    const addMemberRes = await app.request(
      `/api/v1/projects/${projectId}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          employeeId: secondEmpId,
          projectRole: 'MEMBER',
        }),
      },
      env
    );
    expect(addMemberRes.status).toBe(201);

    // List members
    const membersRes = await app.request(
      `/api/v1/projects/${projectId}/members`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
      },
      env
    );
    expect(membersRes.status).toBe(200);
    const membersData = await membersRes.json() as any;
    expect(membersData.data.length).toBeGreaterThanOrEqual(1);
    expect(membersData.data.some((m: any) => m.employeeId === secondEmpId)).toBe(true);

    // Remove member
    const removeRes = await app.request(
      `/api/v1/projects/${projectId}/members/${secondEmpId}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
      },
      env
    );
    expect(removeRes.status).toBe(200);
  });

  it('should block deletion of project with active tasks (PROJECT_HAS_ACTIVE_TASKS)', async () => {
    const { tenantId, employeeId, accessCookie } = await setupTenant({
      email: 'guard@taskguard.com',
      tenantName: 'Guard Corp',
      tenantSlug: 'guard-corp',
    });

    const db = createDb(env.DB);

    // Create project
    const projRes = await app.request(
      '/api/v1/projects',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${accessCookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          name: 'Protected Project',
          projectCode: 'PRJ-PROT-01',
          ownerEmployeeId: employeeId,
        }),
      },
      env
    );
    const projData = await projRes.json() as any;
    const projectId = projData.data.id;

    // Insert an active task directly
    await db.insert(tasks).values({
      id: crypto.randomUUID(),
      tenantId,
      projectId,
      taskCode: 'TSK-ACTIVE-01',
      title: 'Active Task',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    });

    // Attempt to delete project
    const deleteRes = await app.request(
      `/api/v1/projects/${projectId}`,
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
    const data = await deleteRes.json() as any;
    expect(data.error.code).toBe('PROJECT_HAS_ACTIVE_TASKS');
  });

  it('should enforce strict cross-tenant isolation for projects', async () => {
    const tenantA = await setupTenant({
      email: 'admin@t-a.com',
      tenantName: 'Tenant Alpha',
      tenantSlug: 'alpha',
    });

    const tenantB = await setupTenant({
      email: 'admin@t-b.com',
      tenantName: 'Tenant Beta',
      tenantSlug: 'beta',
    });

    // Create project in Tenant A
    const resA = await app.request(
      '/api/v1/projects',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
        body: JSON.stringify({
          name: 'Alpha Secret Project',
          projectCode: 'ALPHA-001',
          ownerEmployeeId: tenantA.employeeId,
        }),
      },
      env
    );
    const projA = (await resA.json() as any).data;

    // Tenant B attempts to fetch Tenant A project
    const fetchRes = await app.request(
      `/api/v1/projects/${projA.id}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${tenantB.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId,
        },
      },
      env
    );

    expect(fetchRes.status).toBe(404);
  });
});
