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

describe('Tasks API Integration Tests', () => {
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

  async function setupProjectEnvironment() {
    const db = createDb(env.DB);
    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const passwordHash = await hashPassword('TestPassword123!');

    await db.insert(users).values({
      id: userId,
      email: 'lead@tasktesting.com',
      passwordHash,
      firstName: 'Task',
      lastName: 'Manager',
      status: 'ACTIVE',
      emailVerified: true,
    });

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Task Testing Co',
      slug: 'task-test',
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

    const leadEmployeeId = crypto.randomUUID();
    await db.insert(employees).values({
      id: leadEmployeeId,
      tenantId,
      userId,
      employeeCode: 'EMP-LEAD-001',
      firstName: 'Project',
      lastName: 'Lead',
      workEmail: 'lead@tasktesting.com',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      jobTitle: 'Engineering Lead',
      joiningDate: new Date('2025-01-01'),
    });

    const memberEmployeeId = crypto.randomUUID();
    await db.insert(employees).values({
      id: memberEmployeeId,
      tenantId,
      employeeCode: 'EMP-DEV-002',
      firstName: 'Project',
      lastName: 'Dev',
      workEmail: 'dev@tasktesting.com',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      jobTitle: 'Developer',
      joiningDate: new Date('2025-01-01'),
    });

    const outsideEmployeeId = crypto.randomUUID();
    await db.insert(employees).values({
      id: outsideEmployeeId,
      tenantId,
      employeeCode: 'EMP-OUT-003',
      firstName: 'Outside',
      lastName: 'Employee',
      workEmail: 'outside@tasktesting.com',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      jobTitle: 'Marketing',
      joiningDate: new Date('2025-01-01'),
    });

    const projectId = crypto.randomUUID();
    await db.insert(projects).values({
      id: projectId,
      tenantId,
      name: 'Alpha Project',
      projectCode: 'PRJ-ALPHA',
      ownerEmployeeId: leadEmployeeId,
      status: 'ACTIVE',
      priority: 'HIGH',
    });

    // Add lead and member to project
    await db.insert(projectMembers).values([
      {
        id: crypto.randomUUID(),
        tenantId,
        projectId,
        employeeId: leadEmployeeId,
        projectRole: 'PROJECT_MANAGER' as const,
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        projectId,
        employeeId: memberEmployeeId,
        projectRole: 'MEMBER' as const,
      },
    ]);

    const loginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-skip-rate-limit': 'true',
        },
        body: JSON.stringify({
          email: 'lead@tasktesting.com',
          password: 'TestPassword123!',
        }),
      },
      env
    );

    const accessCookie = extractCookie(loginRes, 'sr_access')!;
    return {
      userId,
      tenantId,
      projectId,
      leadEmployeeId,
      memberEmployeeId,
      outsideEmployeeId,
      accessCookie,
    };
  }

  it('should create a task successfully when assignee is a project member', async () => {
    const envData = await setupProjectEnvironment();

    const res = await app.request(
      '/api/v1/tasks',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
        body: JSON.stringify({
          projectId: envData.projectId,
          taskCode: 'TSK-001',
          title: 'Implement Authentication Middleware',
          description: 'Hono JWT validation and D1 lookup',
          status: 'TODO',
          priority: 'URGENT',
          assigneeEmployeeId: envData.memberEmployeeId,
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.data.taskCode).toBe('TSK-001');
    expect(data.data.assigneeEmployeeId).toBe(envData.memberEmployeeId);
  });

  it('should reject task assignment if assignee is NOT a project member', async () => {
    const envData = await setupProjectEnvironment();

    const res = await app.request(
      '/api/v1/tasks',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
        body: JSON.stringify({
          projectId: envData.projectId,
          taskCode: 'TSK-002',
          title: 'Design Marketing Banner',
          status: 'TODO',
          priority: 'LOW',
          assigneeEmployeeId: envData.outsideEmployeeId,
        }),
      },
      env
    );

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error.code).toBe('ASSIGNEE_NOT_PROJECT_MEMBER');
  });

  it('should update task status, position and record activity', async () => {
    const envData = await setupProjectEnvironment();

    // Create task
    const createRes = await app.request(
      '/api/v1/tasks',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
        body: JSON.stringify({
          projectId: envData.projectId,
          taskCode: 'TSK-KANBAN-01',
          title: 'Kanban Card Movement',
          status: 'TODO',
          priority: 'MEDIUM',
        }),
      },
      env
    );
    const task = (await createRes.json() as any).data;

    // Move to IN_PROGRESS and position 5
    const patchRes = await app.request(
      `/api/v1/tasks/${task.id}/position`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
        body: JSON.stringify({
          status: 'IN_PROGRESS',
          position: 5,
        }),
      },
      env
    );

    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json() as any).data;
    expect(patched.status).toBe('IN_PROGRESS');
    expect(patched.position).toBe(5);

    // Fetch activity
    const activityRes = await app.request(
      `/api/v1/tasks/${task.id}/activity`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
      },
      env
    );

    expect(activityRes.status).toBe(200);
    const activityData = await activityRes.json() as any;
    expect(activityData.data.length).toBeGreaterThanOrEqual(1);
    expect(activityData.data.some((a: any) => a.action === 'STATUS_CHANGED' || a.action === 'TASK_CREATED')).toBe(true);
  });

  it('should manage task comments (add, list, delete)', async () => {
    const envData = await setupProjectEnvironment();

    // Create task
    const createRes = await app.request(
      '/api/v1/tasks',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
        body: JSON.stringify({
          projectId: envData.projectId,
          taskCode: 'TSK-COMM-01',
          title: 'Comment Testing Task',
        }),
      },
      env
    );
    const task = (await createRes.json() as any).data;

    // Add comment
    const commentRes = await app.request(
      `/api/v1/tasks/${task.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
        body: JSON.stringify({
          content: 'We need to benchmark edge latency first.',
        }),
      },
      env
    );

    expect(commentRes.status).toBe(201);
    const comment = (await commentRes.json() as any).data;
    expect(comment.content).toBe('We need to benchmark edge latency first.');

    // List comments
    const listRes = await app.request(
      `/api/v1/tasks/${task.id}/comments`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
      },
      env
    );

    expect(listRes.status).toBe(200);
    const listData = await listRes.json() as any;
    expect(listData.data.length).toBe(1);
    expect(listData.data[0].id).toBe(comment.id);

    // Delete comment
    const delRes = await app.request(
      `/api/v1/tasks/${task.id}/comments/${comment.id}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
      },
      env
    );
    expect(delRes.status).toBe(200);
  });

  it('should return real dashboard statistics from /api/v1/tasks/dashboard/statistics', async () => {
    const envData = await setupProjectEnvironment();

    // Create an open task and a completed task
    await app.request(
      '/api/v1/tasks',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
        body: JSON.stringify({
          projectId: envData.projectId,
          taskCode: 'TSK-STAT-01',
          title: 'Open Urgent Task',
          status: 'IN_PROGRESS',
          priority: 'URGENT',
          assigneeEmployeeId: envData.leadEmployeeId,
        }),
      },
      env
    );

    const statsRes = await app.request(
      '/api/v1/tasks/dashboard/statistics',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${envData.accessCookie}`,
          'X-Tenant-Id': envData.tenantId,
        },
      },
      env
    );

    expect(statsRes.status).toBe(200);
    const statsData = await statsRes.json() as any;
    expect(statsData.success).toBe(true);
    expect(statsData.data.projects.total).toBeGreaterThanOrEqual(1);
    expect(statsData.data.projects.active).toBeGreaterThanOrEqual(1);
    expect(statsData.data.tasks.total).toBeGreaterThanOrEqual(1);
    expect(statsData.data.tasks.myOpen).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(statsData.data.recentActivity)).toBe(true);
  });
});
