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
  employees,
  organisations,
  branches,
  shifts,
  employeeShifts,
  holidays,
  leaveTypes,
  leaveAllocations,
  performanceCycles,
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import type { Bindings } from '../src/types/env';

describe('Milestone 7 Phase C: HR & Workforce Management API Tests', () => {
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

  async function setupUserAndTenant(options: {
    email: string;
    tenantName: string;
    tenantSlug: string;
    roleCode?: string;
  }) {
    const db = createDb(env.DB);
    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const employeeId = crypto.randomUUID();
    const passwordHash = await hashPassword('Password123!');

    await db.insert(users).values({
      id: userId,
      email: options.email.toLowerCase(),
      passwordHash,
      firstName: 'HR',
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
      id: crypto.randomUUID(),
      userId,
      tenantId,
      isDefault: true,
      status: 'ACTIVE',
    });

    await db.insert(roles).values({
      id: roleId,
      tenantId,
      name: options.roleCode || 'TENANT_ADMIN',
      code: options.roleCode || 'TENANT_ADMIN',
      roleType: 'SYSTEM',
    });

    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      userId,
      roleId,
      tenantId,
    });

    await db.insert(employees).values({
      id: employeeId,
      tenantId,
      userId,
      employeeCode: `EMP-${options.tenantSlug.toUpperCase().slice(0, 3)}-001`,
      firstName: 'HR',
      lastName: 'Specialist',
      workEmail: options.email,
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
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
        body: JSON.stringify({ email: options.email, password: 'Password123!' }),
      },
      env
    );

    const accessCookie = extractCookie(loginRes, 'sr_access');
    if (!accessCookie) throw new Error('Login failed to return sr_access cookie');

    return {
      userId,
      tenantId,
      employeeId,
      accessCookie,
    };
  }

  // ==========================================
  // 1. SHIFT MANAGEMENT TESTS
  // ==========================================

  it('1. should create shifts, assign to employee, and retrieve employee shifts', async () => {
    const admin = await setupUserAndTenant({
      email: 'shift-admin@test.com',
      tenantName: 'Shift Corp',
      tenantSlug: 'shiftcorp',
    });

    // Create shift
    const createRes = await app.request(
      '/api/v1/hr/shifts',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          code: 'GEN',
          name: 'General 9-6',
          startTime: '09:00',
          endTime: '18:00',
          gracePeriodMinutes: 15,
          halfDayThresholdMinutes: 240,
        }),
      },
      env
    );

    expect(createRes.status).toBe(201);
    const createData = await createRes.json() as any;
    expect(createData.data.code).toBe('GEN');
    const shiftId = createData.data.id;

    // Reject duplicate shift code
    const dupRes = await app.request(
      '/api/v1/hr/shifts',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          code: 'GEN',
          name: 'General Shift Duplicate',
          startTime: '09:00',
          endTime: '18:00',
        }),
      },
      env
    );
    expect(dupRes.status).toBe(409);

    // Assign shift to employee
    const assignRes = await app.request(
      `/api/v1/hr/employees/${admin.employeeId}/shifts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          shiftId,
          effectiveFrom: '2026-01-01',
        }),
      },
      env
    );
    expect(assignRes.status).toBe(201);

    // Get employee shifts
    const getRes = await app.request(
      `/api/v1/hr/employees/${admin.employeeId}/shifts`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(getRes.status).toBe(200);
    const getData = await getRes.json() as any;
    expect(getData.data.length).toBe(1);
    expect(getData.data[0].shiftId).toBe(shiftId);
  });

  // ==========================================
  // 2. HOLIDAY CALENDAR TESTS
  // ==========================================

  it('2. should manage company-wide and branch-specific holidays without cross-branch collision', async () => {
    const admin = await setupUserAndTenant({
      email: 'holiday-admin@test.com',
      tenantName: 'Holiday Corp',
      tenantSlug: 'holcorp',
    });

    const db = createDb(env.DB);
    const orgId = crypto.randomUUID();
    const branch1Id = crypto.randomUUID();
    const branch2Id = crypto.randomUUID();

    await db.insert(organisations).values({
      id: orgId,
      tenantId: admin.tenantId,
      name: 'Holiday Org',
      code: 'HORG',
    });

    await db.insert(branches).values({
      id: branch1Id,
      tenantId: admin.tenantId,
      organisationId: orgId,
      name: 'Branch Alpha',
      code: 'ALPHA',
    });
    await db.insert(branches).values({
      id: branch2Id,
      tenantId: admin.tenantId,
      organisationId: orgId,
      name: 'Branch Beta',
      code: 'BETA',
    });

    // 1. Company-wide holiday on 2026-01-01
    const globalRes = await app.request(
      '/api/v1/hr/holidays',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          name: 'New Year Day',
          date: '2026-01-01',
          holidayType: 'MANDATORY',
        }),
      },
      env
    );
    expect(globalRes.status).toBe(201);

    // 2. Branch 1 specific holiday on 2026-03-15
    const b1Res = await app.request(
      '/api/v1/hr/holidays',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          name: 'Branch Alpha Anniversary',
          date: '2026-03-15',
          applicableBranchId: branch1Id,
        }),
      },
      env
    );
    expect(b1Res.status).toBe(201);

    // 3. Branch 2 specific holiday on same date (2026-03-15) - should succeed due to 0005 partial branch index
    const b2Res = await app.request(
      '/api/v1/hr/holidays',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          name: 'Branch Beta Festival',
          date: '2026-03-15',
          applicableBranchId: branch2Id,
        }),
      },
      env
    );
    expect(b2Res.status).toBe(201);

    // List holidays
    const listRes = await app.request(
      '/api/v1/hr/holidays',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(listRes.status).toBe(200);
    const listData = await listRes.json() as any;
    expect(listData.data.length).toBe(3);
  });

  // ==========================================
  // 3. ATTENDANCE & REGULARIZATION TESTS
  // ==========================================

  it('3. should handle daily punch-in, idempotent punches, punch-out, and regularization flow', async () => {
    const admin = await setupUserAndTenant({
      email: 'att-admin@test.com',
      tenantName: 'Attendance Corp',
      tenantSlug: 'attcorp',
    });

    const today = '2026-11-24';

    // Punch in
    const punchInRes = await app.request(
      '/api/v1/hr/attendance/punch-in',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          date: today,
          note: 'Starting work',
        }),
      },
      env
    );
    expect(punchInRes.status).toBe(200);
    const punchInData = await punchInRes.json() as any;
    expect(punchInData.data.date).toBe(today);
    expect(punchInData.data.punchInTime).toBeTruthy();

    // Idempotent punch-in on same day returns same record
    const idempRes = await app.request(
      '/api/v1/hr/attendance/punch-in',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          date: today,
        }),
      },
      env
    );
    expect(idempRes.status).toBe(200);

    // Punch out
    const punchOutRes = await app.request(
      '/api/v1/hr/attendance/punch-out',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          date: today,
          note: 'Done for the day',
        }),
      },
      env
    );
    expect(punchOutRes.status).toBe(200);
    const punchOutData = await punchOutRes.json() as any;
    expect(punchOutData.data.punchOutTime).toBeTruthy();

    // Attendance Regularization Request
    const regRes = await app.request(
      '/api/v1/hr/attendance/regularizations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          attendanceRecordId: punchInData.data.id,
          date: today,
          requestedPunchIn: Date.now() - 28800000,
          requestedPunchOut: Date.now(),
          reason: 'Forgot punch card badge in morning',
        }),
      },
      env
    );
    expect(regRes.status).toBe(201);
    const regData = await regRes.json() as any;
    const regId = regData.data.id;

    // Approve regularization
    const approveRegRes = await app.request(
      `/api/v1/hr/attendance/regularizations/${regId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          status: 'APPROVED',
          reviewNotes: 'Verified with security desk',
        }),
      },
      env
    );
    expect(approveRegRes.status).toBe(200);
    const approveData = await approveRegRes.json() as any;
    expect(approveData.data.status).toBe('APPROVED');
  });

  // ==========================================
  // 4. LEAVE MANAGEMENT TESTS
  // ==========================================

  it('4. should manage leave types, quotas, balance validation, requests, approval and cancellation', async () => {
    const admin = await setupUserAndTenant({
      email: 'leave-admin@test.com',
      tenantName: 'Leave Corp',
      tenantSlug: 'leavecorp',
    });

    // Create Leave Type
    const ltRes = await app.request(
      '/api/v1/hr/leave/types',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          code: 'ANNUAL',
          name: 'Annual Paid Leave',
          defaultDaysPerYear: 15,
          isPaid: true,
        }),
      },
      env
    );
    expect(ltRes.status).toBe(201);
    const ltData = await ltRes.json() as any;
    const leaveTypeId = ltData.data.id;

    // Allocate 10 days for 2026
    const allocRes = await app.request(
      '/api/v1/hr/leave/allocations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          employeeId: admin.employeeId,
          leaveTypeId,
          year: 2026,
          allocatedDays: 10,
        }),
      },
      env
    );
    expect(allocRes.status).toBe(201);

    // Verify Balances
    const balRes = await app.request(
      `/api/v1/hr/leave/balances/${admin.employeeId}?year=2026`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(balRes.status).toBe(200);
    const balData = await balRes.json() as any;
    expect(balData.data[0].allocatedDays).toBe(10);
    expect(balData.data[0].remainingDays).toBe(10);

    // Attempt requesting more days than balance (15 > 10)
    const overReqRes = await app.request(
      '/api/v1/hr/leave/requests',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          leaveTypeId,
          startDate: '2026-06-01',
          endDate: '2026-06-15',
          totalDays: 15,
          reason: 'Long vacation',
        }),
      },
      env
    );
    expect(overReqRes.status).toBe(400);

    // Apply for 2 days valid leave
    const validReqRes = await app.request(
      '/api/v1/hr/leave/requests',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          leaveTypeId,
          startDate: '2026-06-01',
          endDate: '2026-06-02',
          totalDays: 2,
          reason: 'Family visit',
        }),
      },
      env
    );
    expect(validReqRes.status).toBe(201);
    const validReqData = await validReqRes.json() as any;
    const reqId = validReqData.data.id;

    // Attempt overlapping request on same dates
    const overlapRes = await app.request(
      '/api/v1/hr/leave/requests',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          leaveTypeId,
          startDate: '2026-06-02',
          endDate: '2026-06-04',
          totalDays: 3,
          reason: 'Overlapping trip',
        }),
      },
      env
    );
    expect(overlapRes.status).toBe(409);

    // Approve leave request
    const approveRes = await app.request(
      `/api/v1/hr/leave/requests/${reqId}/approve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          reviewNotes: 'Approved by management',
        }),
      },
      env
    );
    expect(approveRes.status).toBe(200);

    // Check balances: allocated 10, used 2, remaining 8
    const balAfterRes = await app.request(
      `/api/v1/hr/leave/balances/${admin.employeeId}?year=2026`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    const balAfterData = await balAfterRes.json() as any;
    expect(balAfterData.data[0].usedDays).toBe(2);
    expect(balAfterData.data[0].remainingDays).toBe(8);

    // Cancel approved request -> restores used days
    const cancelRes = await app.request(
      `/api/v1/hr/leave/requests/${reqId}/cancel`,
      {
        method: 'POST',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(cancelRes.status).toBe(200);

    // Balances restored to 10
    const balRestoreRes = await app.request(
      `/api/v1/hr/leave/balances/${admin.employeeId}?year=2026`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    const balRestoreData = await balRestoreRes.json() as any;
    expect(balRestoreData.data[0].usedDays).toBe(0);
    expect(balRestoreData.data[0].remainingDays).toBe(10);
  });

  // ==========================================
  // 5. EMPLOYEE LIFECYCLE & ONBOARDING TESTS
  // ==========================================

  it('5. should manage onboarding tasks, lifecycle events, resignation and exit clearance checklist', async () => {
    const admin = await setupUserAndTenant({
      email: 'life-admin@test.com',
      tenantName: 'Lifecycle Corp',
      tenantSlug: 'lifecorp',
    });

    // Create onboarding task
    const onbRes = await app.request(
      `/api/v1/hr/employees/${admin.employeeId}/onboarding`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          title: 'Setup GitHub Account and Access Token',
          category: 'IT_SETUP',
          dueDate: '2026-12-01',
        }),
      },
      env
    );
    expect(onbRes.status).toBe(201);
    const onbData = await onbRes.json() as any;
    const taskId = onbData.data.id;

    // Complete onboarding task
    const patchTaskRes = await app.request(
      `/api/v1/hr/onboarding/${taskId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          status: 'COMPLETED',
        }),
      },
      env
    );
    expect(patchTaskRes.status).toBe(200);

    // File Resignation
    const resigRes = await app.request(
      `/api/v1/hr/employees/${admin.employeeId}/resignations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          resignationDate: '2026-11-24',
          proposedLastWorkingDate: '2026-12-24',
          reason: 'Pursuing higher studies',
        }),
      },
      env
    );
    expect(resigRes.status).toBe(201);
    const resigData = await resigRes.json() as any;
    const resigId = resigData.data.id;

    // Verify Exit Checklist seeded automatically
    const exitRes = await app.request(
      `/api/v1/hr/employees/${admin.employeeId}/exit-checklist`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(exitRes.status).toBe(200);
    const exitData = await exitRes.json() as any;
    expect(exitData.data.length).toBe(5); // IT, FINANCE, HR, ADMIN, OPERATIONS

    // Complete Resignation
    const patchResigRes = await app.request(
      `/api/v1/hr/resignations/${resigId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          status: 'COMPLETED',
          actualLastWorkingDate: '2026-12-24',
          managerComments: 'Great contributions to team',
        }),
      },
      env
    );
    expect(patchResigRes.status).toBe(200);

    // Verify Lifecycle endpoint contains tasks, resignation, and events
    const lifecycleRes = await app.request(
      `/api/v1/hr/employees/${admin.employeeId}/lifecycle`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(lifecycleRes.status).toBe(200);
    const lifeData = await lifecycleRes.json() as any;
    expect(lifeData.data.onboardingTasks.length).toBe(1);
    expect(lifeData.data.resignations.length).toBe(1);
    expect(lifeData.data.events.length).toBe(1);
    expect(lifeData.data.events[0].eventType).toBe('RESIGNATION');
  });

  // ==========================================
  // 6. EMPLOYEE DOCUMENT METADATA TESTS
  // ==========================================

  it('6. should track employee document metadata without binary payloads', async () => {
    const admin = await setupUserAndTenant({
      email: 'doc-admin@test.com',
      tenantName: 'Document Corp',
      tenantSlug: 'doccorp',
    });

    // Add Document Metadata
    const createDocRes = await app.request(
      `/api/v1/hr/employees/${admin.employeeId}/documents`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          title: 'Employment Agreement 2026',
          documentType: 'CONTRACT',
          documentNumber: 'CNT-2026-009',
          issuedDate: '2026-01-01',
        }),
      },
      env
    );
    expect(createDocRes.status).toBe(201);
    const docData = await createDocRes.json() as any;
    const docId = docData.data.id;

    // Verify Document
    const patchDocRes = await app.request(
      `/api/v1/hr/documents/${docId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          verificationStatus: 'VERIFIED',
          notes: 'Signed original verified',
        }),
      },
      env
    );
    expect(patchDocRes.status).toBe(200);
    const patchDocData = await patchDocRes.json() as any;
    expect(patchDocData.data.verificationStatus).toBe('VERIFIED');
    expect(patchDocData.data.verifiedByEmployeeId).toBeTruthy();

    // Delete Document
    const delRes = await app.request(
      `/api/v1/hr/documents/${docId}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(delRes.status).toBe(200);
  });

  // ==========================================
  // 7. PERFORMANCE MANAGEMENT TESTS
  // ==========================================

  it('7. should manage performance review cycles and separate self-review from manager review', async () => {
    const admin = await setupUserAndTenant({
      email: 'perf-admin@test.com',
      tenantName: 'Performance Corp',
      tenantSlug: 'perfcorp',
    });

    // Create Cycle
    const cycleRes = await app.request(
      '/api/v1/hr/performance/cycles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          code: '2026-Q4',
          name: 'Q4 2026 Review',
          startDate: '2026-10-01',
          endDate: '2026-12-31',
        }),
      },
      env
    );
    expect(cycleRes.status).toBe(201);
    const cycleData = await cycleRes.json() as any;
    const cycleId = cycleData.data.id;

    // Initiate Review
    const revRes = await app.request(
      '/api/v1/hr/performance/reviews',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          cycleId,
          employeeId: admin.employeeId,
        }),
      },
      env
    );
    expect(revRes.status).toBe(201);
    const revData = await revRes.json() as any;
    const reviewId = revData.data.id;

    // 1. Submit Self Review
    const selfRes = await app.request(
      `/api/v1/hr/performance/reviews/${reviewId}/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          type: 'SELF',
          rating: 4.5,
          feedback: 'Delivered all roadmap items on time.',
        }),
      },
      env
    );
    expect(selfRes.status).toBe(200);
    const selfData = await selfRes.json() as any;
    expect(selfData.data.status).toBe('PENDING_MANAGER_REVIEW');
    expect(selfData.data.selfRating).toBe(4.5);

    // 2. Submit Manager Review
    const mgrRes = await app.request(
      `/api/v1/hr/performance/reviews/${reviewId}/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
        body: JSON.stringify({
          type: 'MANAGER',
          rating: 4.2,
          feedback: 'Exceptional ownership and delivery.',
          goalsMet: '5/5 Key Results achieved',
          finalScore: 4.35,
        }),
      },
      env
    );
    expect(mgrRes.status).toBe(200);
    const mgrData = await mgrRes.json() as any;
    expect(mgrData.data.status).toBe('COMPLETED');
    expect(mgrData.data.finalScore).toBe(4.35);
  });

  // ==========================================
  // 8. HR REPORTS & ANALYTICS TESTS
  // ==========================================

  it('8. should return workforce summary, attendance rate, leave metrics, and headcount distribution', async () => {
    const admin = await setupUserAndTenant({
      email: 'report-admin@test.com',
      tenantName: 'Analytics Corp',
      tenantSlug: 'analycorp',
    });

    // 1. Workforce summary
    const sumRes = await app.request(
      '/api/v1/hr/reports/workforce',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(sumRes.status).toBe(200);
    const sumData = await sumRes.json() as any;
    expect(sumData.data.totalHeadcount).toBe(1);
    expect(sumData.data.activeHeadcount).toBe(1);

    // 2. Headcount distribution
    const headRes = await app.request(
      '/api/v1/hr/reports/headcount',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(headRes.status).toBe(200);
    const headData = await headRes.json() as any;
    expect(headData.data.totalHeadcount).toBe(1);
    expect(headData.data.byEmploymentType.FULL_TIME).toBe(1);

    // 3. Attendance report
    const attRes = await app.request(
      '/api/v1/hr/reports/attendance',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(attRes.status).toBe(200);

    // 4. Leaves report
    const leaveRes = await app.request(
      '/api/v1/hr/reports/leaves',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${admin.accessCookie}`,
          'X-Tenant-Id': admin.tenantId,
        },
      },
      env
    );
    expect(leaveRes.status).toBe(200);
  });

  // ==========================================
  // 9. CROSS-TENANT ISOLATION TESTS
  // ==========================================

  it('9. should strictly reject cross-tenant access and manipulation of HR records', async () => {
    const tenantA = await setupUserAndTenant({
      email: 'alpha-hr@test.com',
      tenantName: 'Alpha Corp',
      tenantSlug: 'alphacorp',
    });

    const tenantB = await setupUserAndTenant({
      email: 'beta-hr@test.com',
      tenantName: 'Beta Corp',
      tenantSlug: 'betacorp',
    });

    // Create Shift in Tenant A
    const shiftRes = await app.request(
      '/api/v1/hr/shifts',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantA.accessCookie}`,
          'X-Tenant-Id': tenantA.tenantId,
        },
        body: JSON.stringify({
          code: 'ALPHA-SHIFT',
          name: 'Alpha Shift',
          startTime: '09:00',
          endTime: '18:00',
        }),
      },
      env
    );
    const shiftData = await shiftRes.json() as any;
    const shiftIdA = shiftData.data.id;

    // Tenant B attempts to update Tenant A's shift using Tenant B token & tenant ID
    const crossUpdateRes = await app.request(
      `/api/v1/hr/shifts/${shiftIdA}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${tenantB.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId,
        },
        body: JSON.stringify({
          name: 'Hacked Shift',
        }),
      },
      env
    );
    expect(crossUpdateRes.status).toBe(404);

    // Tenant B attempts to view Tenant A's employee lifecycle
    const crossLifeRes = await app.request(
      `/api/v1/hr/employees/${tenantA.employeeId}/lifecycle`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${tenantB.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId,
        },
      },
      env
    );
    expect(crossLifeRes.status).toBe(404);

    // Tenant B attempts to view Tenant A's leave balances
    const crossBalRes = await app.request(
      `/api/v1/hr/leave/balances/${tenantA.employeeId}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${tenantB.accessCookie}`,
          'X-Tenant-Id': tenantB.tenantId,
        },
      },
      env
    );
    expect(crossBalRes.status).toBe(404);
  });
});
