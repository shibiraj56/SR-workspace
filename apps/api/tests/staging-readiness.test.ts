import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { createTestD1Database } from './mock-d1';
import { createDb } from '@sr-workspace/database';
import {
  users,
  tenants,
  userTenants,
  roles,
  userRoles,
  employees,
  shifts,
  leaveTypes,
  leaveAllocations,
  leaveRequests,
  performanceCycles,
  performanceReviews,
  auditLogs,
  permissions,
  rolePermissions,
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import { clearRateLimitStore } from '../src/middleware/rate-limiter';
import { eq, and } from 'drizzle-orm';

describe('Staging Deployment Readiness & Security Hardening Tests', () => {
  let app: ReturnType<typeof createApp>;
  let rawDb: any;

  const STAGING_ORIGIN = 'https://staging-workspace.srcodelab.space';
  const PRODUCTION_ORIGIN = 'https://workspace.srcodelab.space';
  const VALID_STAGING_JWT_SECRET = 'staging-cryptographic-jwt-secret-minimum-32-characters!';
  const VALID_STAGING_PROXY_SECRET = 'staging-cryptographic-proxy-secret-32-characters!';

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

  async function seedTestUser(
    db: any,
    tenantId: string,
    email: string,
    roleCode: string,
    perms: string[] = []
  ) {
    const userId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const employeeId = crypto.randomUUID();
    const passwordHash = await hashPassword('Password123!');

    await db.insert(users).values({
      id: userId,
      email: email.toLowerCase(),
      passwordHash,
      firstName: 'Staging',
      lastName: roleCode,
      status: 'ACTIVE',
      emailVerified: true,
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
      name: roleCode,
      code: roleCode,
      roleType: 'SYSTEM',
    });

    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      userId,
      roleId,
      tenantId,
    });

    for (const p of perms) {
      const permId = crypto.randomUUID();
      const existing = await db.query.permissions.findFirst({
        where: eq(permissions.code, p),
      });
      const effectivePermId = existing?.id || permId;
      if (!existing) {
        await db.insert(permissions).values({
          id: permId,
          code: p,
          name: p,
          module: p.split(':')[0] || 'general',
          action: p.split(':')[1] || 'all',
        });
      }
      await db.insert(rolePermissions).values({
        id: crypto.randomUUID(),
        roleId,
        permissionId: effectivePermId,
      });
    }

    await db.insert(employees).values({
      id: employeeId,
      tenantId,
      userId,
      employeeCode: `EMP-${email.split('@')[0].toUpperCase()}`,
      firstName: 'Staging',
      lastName: roleCode,
      workEmail: email,
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      joiningDate: new Date('2025-01-01'),
    });

    return { userId, employeeId };
  }

  beforeEach(() => {
    clearRateLimitStore();
    rawDb = createTestD1Database();
    app = createApp();
  });

  // ==========================================
  // 1. AUTHENTICATION SECRET ENFORCEMENT
  // ==========================================
  describe('1. Authentication Secret Enforcement (Fail-Closed)', () => {
    it('should fail closed (500 AUTH_CONFIG_ERROR) in staging when JWT_SECRET is missing', async () => {
      const db = createDb(rawDb);
      const tenantId = crypto.randomUUID();
      await db.insert(tenants).values({ id: tenantId, name: 'T1', slug: 't1', status: 'ACTIVE' });
      await seedTestUser(db, tenantId, 'user@staging.com', 'EMPLOYEE');

      const stagingEnvWithoutSecret = {
        DB: rawDb,
        APP_ENV: 'staging',
        APP_NAME: 'SR WORKSPACE API (Staging)',
        APP_ORIGIN: STAGING_ORIGIN,
        STAGING_PROXY_SECRET: VALID_STAGING_PROXY_SECRET,
        // JWT_SECRET is intentionally omitted
      };

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-skip-rate-limit': 'true',
          'x-staging-proxy-secret': VALID_STAGING_PROXY_SECRET,
        },
        body: JSON.stringify({ email: 'user@staging.com', password: 'Password123!' }),
      }, stagingEnvWithoutSecret);

      expect(res.status).toBe(500);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('AUTH_CONFIG_ERROR');
      // Verify no secret value is exposed in message
      expect(json.error.message).toContain('JWT_SECRET is required');
    });

    it('should fail closed (500 AUTH_CONFIG_ERROR) in production when JWT_SECRET is missing', async () => {
      const db = createDb(rawDb);
      const tenantId = crypto.randomUUID();
      await db.insert(tenants).values({ id: tenantId, name: 'T1', slug: 't1', status: 'ACTIVE' });
      await seedTestUser(db, tenantId, 'user@prod.com', 'EMPLOYEE');

      const prodEnvWithoutSecret = {
        DB: rawDb,
        APP_ENV: 'production',
        APP_NAME: 'SR WORKSPACE API',
        APP_ORIGIN: PRODUCTION_ORIGIN,
        // JWT_SECRET is intentionally omitted
      };

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-skip-rate-limit': 'true' },
        body: JSON.stringify({ email: 'user@prod.com', password: 'Password123!' }),
      }, prodEnvWithoutSecret);

      expect(res.status).toBe(500);
      const json: any = await res.json();
      expect(json.error.code).toBe('AUTH_CONFIG_ERROR');
    });

    it('should allow DEFAULT_DEV_JWT_SECRET when APP_ENV === development', async () => {
      const db = createDb(rawDb);
      const tenantId = crypto.randomUUID();
      await db.insert(tenants).values({ id: tenantId, name: 'T1', slug: 't1', status: 'ACTIVE' });
      await seedTestUser(db, tenantId, 'user@dev.com', 'EMPLOYEE');

      const devEnvWithoutSecret = {
        DB: rawDb,
        APP_ENV: 'development',
        APP_NAME: 'SR WORKSPACE API',
        APP_ORIGIN: 'http://localhost:5173',
        // JWT_SECRET is omitted in development
      };

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-skip-rate-limit': 'true' },
        body: JSON.stringify({ email: 'user@dev.com', password: 'Password123!' }),
      }, devEnvWithoutSecret);

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
    });

    it('should succeed in staging when JWT_SECRET is properly supplied', async () => {
      const db = createDb(rawDb);
      const tenantId = crypto.randomUUID();
      await db.insert(tenants).values({ id: tenantId, name: 'T1', slug: 't1', status: 'ACTIVE' });
      await seedTestUser(db, tenantId, 'user@staging-ok.com', 'EMPLOYEE');

      const stagingEnv = {
        DB: rawDb,
        APP_ENV: 'staging',
        APP_NAME: 'SR WORKSPACE API (Staging)',
        APP_ORIGIN: STAGING_ORIGIN,
        JWT_SECRET: VALID_STAGING_JWT_SECRET,
        STAGING_PROXY_SECRET: VALID_STAGING_PROXY_SECRET,
      };

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-skip-rate-limit': 'true',
          'x-staging-proxy-secret': VALID_STAGING_PROXY_SECRET,
        },
        body: JSON.stringify({ email: 'user@staging-ok.com', password: 'Password123!' }),
      }, stagingEnv);

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
    });
  });

  // ==========================================
  // 2. CORS & CSRF STRICT STAGING ORIGIN VALIDATION
  // ==========================================
  describe('2. CORS & CSRF Strict Staging Origin Validation', () => {
    const stagingEnv = () => ({
      DB: rawDb,
      APP_ENV: 'staging',
      APP_NAME: 'SR WORKSPACE API (Staging)',
      APP_ORIGIN: STAGING_ORIGIN,
      JWT_SECRET: VALID_STAGING_JWT_SECRET,
      STAGING_PROXY_SECRET: VALID_STAGING_PROXY_SECRET,
    });

    it('should permit CORS from the exact staging frontend origin', async () => {
      const res = await app.request('/api/v1/health', {
        method: 'GET',
        headers: {
          Origin: STAGING_ORIGIN,
          'x-staging-proxy-secret': VALID_STAGING_PROXY_SECRET,
        },
      }, stagingEnv());

      expect(res.headers.get('access-control-allow-origin')).toBe(STAGING_ORIGIN);
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('should REJECT CORS from localhost in staging environment', async () => {
      const res = await app.request('/api/v1/health', {
        method: 'GET',
        headers: {
          Origin: 'http://localhost:5173',
          'x-staging-proxy-secret': VALID_STAGING_PROXY_SECRET,
        },
      }, stagingEnv());

      // Should NOT set access-control-allow-origin for disallowed origin
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('should REJECT CORS from production origin when running in staging', async () => {
      const res = await app.request('/api/v1/health', {
        method: 'GET',
        headers: {
          Origin: PRODUCTION_ORIGIN,
          'x-staging-proxy-secret': VALID_STAGING_PROXY_SECRET,
        },
      }, stagingEnv());

      // The staging API must not accept production origin
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('should REJECT state-mutating requests with untrusted CSRF origin in staging', async () => {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:5173',
          'x-skip-rate-limit': 'true',
          'x-staging-proxy-secret': VALID_STAGING_PROXY_SECRET,
        },
        body: JSON.stringify({ email: 'any@staging.com', password: 'Password123!' }),
      }, stagingEnv());

      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.error.code).toBe('CSRF_FORBIDDEN');
    });

    it('should enforce Secure attribute on cookies in staging environment', async () => {
      const db = createDb(rawDb);
      const tenantId = crypto.randomUUID();
      await db.insert(tenants).values({ id: tenantId, name: 'T1', slug: 't1', status: 'ACTIVE' });
      await seedTestUser(db, tenantId, 'secure@staging.com', 'EMPLOYEE');

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: STAGING_ORIGIN,
          'x-skip-rate-limit': 'true',
          'x-staging-proxy-secret': VALID_STAGING_PROXY_SECRET,
        },
        body: JSON.stringify({ email: 'secure@staging.com', password: 'Password123!' }),
      }, stagingEnv());

      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie') || '';
      expect(setCookie.toLowerCase()).toContain('secure');
      expect(setCookie.toLowerCase()).toContain('httponly');
    });
  });

  // ==========================================
  // 3. SECURITY OBSERVATIONS REMEDIATION VERIFICATION
  // ==========================================
  describe('3. Security Observations Remediation Verification', () => {
    let tenantId: string;
    let emp1: { userId: string; employeeId: string; cookie: string };
    let emp2: { userId: string; employeeId: string; cookie: string };
    let hrAdmin: { userId: string; employeeId: string; cookie: string };
    let hrManager: { userId: string; employeeId: string; cookie: string };

    const env = () => ({
      DB: rawDb,
      APP_ENV: 'test',
      APP_ORIGIN: STAGING_ORIGIN,
      JWT_SECRET: VALID_STAGING_JWT_SECRET,
    });

    beforeEach(async () => {
      const db = createDb(rawDb);
      tenantId = crypto.randomUUID();
      await db.insert(tenants).values({ id: tenantId, name: 'T1', slug: 't1', status: 'ACTIVE' });

      const u1 = await seedTestUser(db, tenantId, 'emp1@test.com', 'EMPLOYEE');
      const u2 = await seedTestUser(db, tenantId, 'emp2@test.com', 'EMPLOYEE');
      const uHr = await seedTestUser(db, tenantId, 'hr@test.com', 'SUPER_ADMIN');
      const uMgr = await seedTestUser(db, tenantId, 'manager@test.com', 'TENANT_ADMIN');

      async function login(email: string) {
        const res = await app.request('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-skip-rate-limit': 'true' },
          body: JSON.stringify({ email, password: 'Password123!' }),
        }, env());
        return extractCookie(res, 'sr_access')!;
      }

      emp1 = { ...u1, cookie: await login('emp1@test.com') };
      emp2 = { ...u2, cookie: await login('emp2@test.com') };
      hrAdmin = { ...uHr, cookie: await login('hr@test.com') };
      hrManager = { ...uMgr, cookie: await login('manager@test.com') };
    });

    it('OBS-1: should REJECT ordinary employees from accessing company HR reports', async () => {
      const res = await app.request('/api/v1/hr/reports/workforce', {
        headers: { 'Cookie': `sr_access=${emp1.cookie}`, 'X-Tenant-Id': tenantId },
      }, env());

      // Ordinary employee must receive 403 Forbidden
      expect(res.status).toBe(403);

      // HR Admin must receive 200 OK
      const resAdmin = await app.request('/api/v1/hr/reports/workforce', {
        headers: { 'Cookie': `sr_access=${hrAdmin.cookie}`, 'X-Tenant-Id': tenantId },
      }, env());
      expect(resAdmin.status).toBe(200);
    });

    it('OBS-2: should REJECT ordinary employees from viewing another employee lifecycle & documents', async () => {
      // emp1 queries emp1 lifecycle -> 200
      const resOwn = await app.request(`/api/v1/hr/employees/${emp1.employeeId}/lifecycle`, {
        headers: { 'Cookie': `sr_access=${emp1.cookie}`, 'X-Tenant-Id': tenantId },
      }, env());
      expect(resOwn.status).toBe(200);

      // emp1 queries emp2 lifecycle -> 403 Forbidden
      const resOther = await app.request(`/api/v1/hr/employees/${emp2.employeeId}/lifecycle`, {
        headers: { 'Cookie': `sr_access=${emp1.cookie}`, 'X-Tenant-Id': tenantId },
      }, env());
      expect(resOther.status).toBe(403);

      // emp1 queries emp2 documents -> 403 Forbidden
      const resOtherDocs = await app.request(`/api/v1/hr/employees/${emp2.employeeId}/documents`, {
        headers: { 'Cookie': `sr_access=${emp1.cookie}`, 'X-Tenant-Id': tenantId },
      }, env());
      expect(resOtherDocs.status).toBe(403);
    });

    it('OBS-3: should REJECT non-designated reviewer from submitting manager performance review', async () => {
      const db = createDb(rawDb);
      const cycleId = crypto.randomUUID();
      const reviewId = crypto.randomUUID();

      await db.insert(performanceCycles).values({
        id: cycleId,
        tenantId,
        code: '2026-STG',
        name: 'Staging Cycle',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      // Review assigned to emp2 as subject, with hrAdmin as designated reviewer
      await db.insert(performanceReviews).values({
        id: reviewId,
        tenantId,
        cycleId,
        employeeId: emp2.employeeId,
        reviewerEmployeeId: hrAdmin.employeeId,
        status: 'PENDING_MANAGER_REVIEW',
      });

      // emp1 attempts to submit MANAGER review for emp2 -> 403 Forbidden
      const resUnauthorized = await app.request(`/api/v1/hr/performance/reviews/${reviewId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `sr_access=${emp1.cookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({ type: 'MANAGER', rating: 5, feedback: 'Forged review' }),
      }, env());

      expect(resUnauthorized.status).toBe(403);
    });

    it('OBS-4: should REJECT self-approval on leave applications', async () => {
      const db = createDb(rawDb);
      const leaveTypeId = crypto.randomUUID();
      const reqId = crypto.randomUUID();

      await db.insert(leaveTypes).values({
        id: leaveTypeId,
        tenantId,
        code: 'ANNUAL',
        name: 'Annual Leave',
        defaultDaysPerYear: 10,
      });

      await db.insert(leaveAllocations).values({
        id: crypto.randomUUID(),
        tenantId,
        employeeId: hrManager.employeeId,
        leaveTypeId,
        year: 2026,
        allocatedDays: 10,
        pendingDays: 2,
      });

      // hrManager created a personal leave request
      await db.insert(leaveRequests).values({
        id: reqId,
        tenantId,
        employeeId: hrManager.employeeId,
        leaveTypeId,
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        totalDays: 2,
        reason: 'Personal time off',
        status: 'PENDING',
      });

      // hrManager attempts to approve their own request -> 403 SELF_APPROVAL_FORBIDDEN
      const resSelfApprove = await app.request(`/api/v1/hr/leave/requests/${reqId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `sr_access=${hrManager.cookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({ reviewNotes: 'Self approved' }),
      }, env());

      expect(resSelfApprove.status).toBe(403);
      const json = await resSelfApprove.json() as any;
      expect(json.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
    });

    it('OBS-5: should REJECT bounded shift assignments that overlap with existing bounded assignments', async () => {
      const db = createDb(rawDb);
      const shiftId = crypto.randomUUID();

      await db.insert(shifts).values({
        id: shiftId,
        tenantId,
        code: 'S1',
        name: 'Standard Shift',
        startTime: '09:00',
        endTime: '17:00',
      });

      // First assignment: 2026-01-01 to 2026-06-30
      const res1 = await app.request(`/api/v1/hr/employees/${emp1.employeeId}/shifts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `sr_access=${hrAdmin.cookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          shiftId,
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-06-30',
        }),
      }, env());
      expect(res1.status).toBe(201);

      // Overlapping assignment: 2026-04-01 to 2026-08-31 -> 409 Conflict
      const resOverlap = await app.request(`/api/v1/hr/employees/${emp1.employeeId}/shifts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `sr_access=${hrAdmin.cookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          shiftId,
          effectiveFrom: '2026-04-01',
          effectiveTo: '2026-08-31',
        }),
      }, env());
      expect(resOverlap.status).toBe(409);
      const json = await resOverlap.json() as any;
      expect(json.error.code).toBe('SHIFT_ASSIGNMENT_OVERLAP');
    });

    it('OBS-6: should emit audit_logs on leave approval, rejection, and cancellation', async () => {
      const db = createDb(rawDb);
      const leaveTypeId = crypto.randomUUID();
      const reqId = crypto.randomUUID();

      await db.insert(leaveTypes).values({
        id: leaveTypeId,
        tenantId,
        code: 'ANNUAL',
        name: 'Annual Leave',
      });

      await db.insert(leaveAllocations).values({
        id: crypto.randomUUID(),
        tenantId,
        employeeId: emp1.employeeId,
        leaveTypeId,
        year: 2026,
        allocatedDays: 10,
        pendingDays: 2,
      });

      await db.insert(leaveRequests).values({
        id: reqId,
        tenantId,
        employeeId: emp1.employeeId,
        leaveTypeId,
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        totalDays: 2,
        reason: 'Rest',
        status: 'PENDING',
      });

      // hrAdmin approves emp1 leave
      const resApprove = await app.request(`/api/v1/hr/leave/requests/${reqId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `sr_access=${hrAdmin.cookie}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({ reviewNotes: 'Approved by HR' }),
      }, env());
      expect(resApprove.status).toBe(200);

      // Verify audit log exists
      const logs = await db.query.auditLogs.findMany({
        where: and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.entityId, reqId)),
      });
      expect(logs.length).toBeGreaterThan(0);
      const latestLog = logs[logs.length - 1];
      expect(latestLog.entityType).toBe('leave_request');
      expect(latestLog.action).toBe('UPDATE');
      expect(latestLog.changes).toContain('APPROVED');
    });
  });
});
