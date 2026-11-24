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
  invitations,
  auditLogs,
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import { InvitationsService } from '../src/modules/invitations/invitations.service';
import type { Bindings } from '../src/types/env';
import { eq, and } from 'drizzle-orm';

describe('Employee Invitation Backend & Security Suite', () => {
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
      plan: 'ENTERPRISE',
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
      name: options.roleCode === 'VIEWER' ? 'Read-Only Viewer' : 'Tenant Admin',
      code: options.roleCode || 'TENANT_ADMIN',
      roleType: 'SYSTEM',
    });

    await db.insert(userRoles).values({
      userId,
      roleId,
      tenantId,
    });

    // Also seed a default global EMPLOYEE role if not existing
    const defaultEmployeeRole = await db.query.roles.findFirst({
      where: eq(roles.code, 'EMPLOYEE'),
    });
    if (!defaultEmployeeRole) {
      await db.insert(roles).values({
        id: crypto.randomUUID(),
        name: 'Standard Employee',
        code: 'EMPLOYEE',
        roleType: 'SYSTEM',
      });
    }

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
    return { userId, tenantId, roleId, accessCookie };
  }

  async function createTestEmployee(options: {
    tenantId: string;
    userId?: string | null;
    workEmail?: string | null;
    personalEmail?: string | null;
    code?: string;
  }) {
    const db = createDb(env.DB);
    const empId = crypto.randomUUID();
    const employeeCode = options.code || `EMP-${Math.floor(1000 + Math.random() * 9000)}`;

    await db.insert(employees).values({
      id: empId,
      tenantId: options.tenantId,
      employeeCode,
      firstName: 'Jane',
      lastName: 'Doe',
      workEmail: options.workEmail !== undefined ? options.workEmail : 'jane.doe@srcodelab.space',
      personalEmail: options.personalEmail !== undefined ? options.personalEmail : 'jane.personal@example.com',
      userId: options.userId || null,
      employmentType: 'FULL_TIME',
      joiningDate: new Date('2026-01-15'),
      employmentStatus: 'ACTIVE',
      createdBy: null,
      updatedBy: null,
    });

    return empId;
  }

  describe('1. Permission Enforcement & Tenant Scoping', () => {
    it('1.1 should reject unauthenticated request to POST /api/v1/employees/:id/invite with 401', async () => {
      const res = await app.request(
        '/api/v1/employees/emp-123/invite',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresIn: '7d' }),
        },
        env
      );

      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('1.2 should reject user with insufficient permissions (VIEWER) with 403', async () => {
      const { tenantId, accessCookie } = await createTenantAndUser({
        email: 'viewer@srcodelab.space',
        tenantName: 'SR TEST',
        tenantSlug: 'sr-test',
        roleCode: 'VIEWER',
      });
      const empId = await createTestEmployee({ tenantId });

      const res = await app.request(
        `/api/v1/employees/${empId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${accessCookie}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({ expiresIn: '7d' }),
        },
        env
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RBAC_FORBIDDEN');
    });

    it('1.3 should reject cross-tenant invitation with 404', async () => {
      const tenantA = await createTenantAndUser({
        email: 'admin.a@srcodelab.space',
        tenantName: 'Tenant Alpha',
        tenantSlug: 'tenant-alpha',
      });
      const tenantB = await createTenantAndUser({
        email: 'admin.b@srcodelab.space',
        tenantName: 'Tenant Beta',
        tenantSlug: 'tenant-beta',
      });

      const empIdInTenantB = await createTestEmployee({ tenantId: tenantB.tenantId });

      // Admin A tries to invite employee belonging to Tenant B
      const res = await app.request(
        `/api/v1/employees/${empIdInTenantB}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${tenantA.accessCookie}`,
            'X-Tenant-Id': tenantA.tenantId,
          },
          body: JSON.stringify({ expiresIn: '7d' }),
        },
        env
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    });

    it('1.4 should reject role belonging to a different tenant with 403', async () => {
      const tenantA = await createTenantAndUser({
        email: 'admin.a2@srcodelab.space',
        tenantName: 'Tenant Alpha 2',
        tenantSlug: 'tenant-alpha-2',
      });
      const tenantB = await createTenantAndUser({
        email: 'admin.b2@srcodelab.space',
        tenantName: 'Tenant Beta 2',
        tenantSlug: 'tenant-beta-2',
      });

      const empId = await createTestEmployee({ tenantId: tenantA.tenantId });

      const res = await app.request(
        `/api/v1/employees/${empId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${tenantA.accessCookie}`,
            'X-Tenant-Id': tenantA.tenantId,
          },
          body: JSON.stringify({
            roleId: tenantB.roleId, // Role belongs to Tenant B!
            expiresIn: '7d',
          }),
        },
        env
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_ROLE_SCOPE');
    });
  });

  describe('2. Employee Eligibility & Linkage Validation', () => {
    it('2.1 should reject employee already linked to an existing user account with 409', async () => {
      const { tenantId, userId, accessCookie } = await createTenantAndUser({
        email: 'admin.elig@srcodelab.space',
        tenantName: 'Eligibility Tenant',
        tenantSlug: 'eligibility-tenant',
      });
      const empId = await createTestEmployee({ tenantId, userId }); // already linked!

      const res = await app.request(
        `/api/v1/employees/${empId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${accessCookie}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({ expiresIn: '7d' }),
        },
        env
      );

      expect(res.status).toBe(409);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EMPLOYEE_ALREADY_LINKED');
    });

    it('2.2 should reject employee missing both work and personal email with 400', async () => {
      const { tenantId, accessCookie } = await createTenantAndUser({
        email: 'admin.noemail@srcodelab.space',
        tenantName: 'No Email Tenant',
        tenantSlug: 'no-email-tenant',
      });
      const empId = await createTestEmployee({
        tenantId,
        workEmail: null,
        personalEmail: null,
      });

      const res = await app.request(
        `/api/v1/employees/${empId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${accessCookie}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({ expiresIn: '7d' }),
        },
        env
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EMPLOYEE_MISSING_EMAIL');
    });
  });

  describe('3. Duplicate, Expiry & Duration Rules', () => {
    it('3.1 should reject duplicate invitation when an active pending invitation exists with 409', async () => {
      const { tenantId, accessCookie } = await createTenantAndUser({
        email: 'admin.dup@srcodelab.space',
        tenantName: 'Dup Tenant',
        tenantSlug: 'dup-tenant',
      });
      const empId = await createTestEmployee({ tenantId });

      // First invite succeeds
      const firstRes = await app.request(
        `/api/v1/employees/${empId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${accessCookie}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({ expiresIn: '7d' }),
        },
        env
      );
      expect(firstRes.status).toBe(201);

      // Second invite fails with 409 INVITATION_ALREADY_PENDING
      const secondRes = await app.request(
        `/api/v1/employees/${empId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${accessCookie}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({ expiresIn: '7d' }),
        },
        env
      );
      expect(secondRes.status).toBe(409);
      const body = (await secondRes.json()) as any;
      expect(body.error.code).toBe('INVITATION_ALREADY_PENDING');
    });

    it('3.2 should allow issuing a new invitation if previous pending invitation expired', async () => {
      const { tenantId, userId, accessCookie } = await createTenantAndUser({
        email: 'admin.expire@srcodelab.space',
        tenantName: 'Expire Tenant',
        tenantSlug: 'expire-tenant',
      });
      const empId = await createTestEmployee({ tenantId });
      const db = createDb(env.DB);

      // Create an expired invitation directly in DB
      const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
      await db.insert(invitations).values({
        id: crypto.randomUUID(),
        tenantId,
        employeeId: empId,
        email: 'jane.doe@srcodelab.space',
        tokenHash: 'dummy-expired-hash-1234567890',
        roleId: (await db.query.roles.findFirst({ where: eq(roles.code, 'EMPLOYEE') }))!.id,
        status: 'PENDING',
        invitedBy: userId,
        expiresAt: pastDate,
      });

      // Issuing a new invite should succeed and automatically expire the stale one
      const res = await app.request(
        `/api/v1/employees/${empId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${accessCookie}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({ expiresIn: '48h' }),
        },
        env
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('PENDING');

      // Check DB: old invite must be marked EXPIRED
      const allInvites = await db.query.invitations.findMany({
        where: eq(invitations.employeeId, empId),
      });
      expect(allInvites).toHaveLength(2);
      expect(allInvites.some((i) => i.status === 'EXPIRED')).toBe(true);
      expect(allInvites.some((i) => i.status === 'PENDING')).toBe(true);
    });

    it('3.3 should accept approved durations (48h, 7d, 14d) and reject invalid duration (30d) with 400', async () => {
      const { tenantId, accessCookie } = await createTenantAndUser({
        email: 'admin.dur@srcodelab.space',
        tenantName: 'Duration Tenant',
        tenantSlug: 'dur-tenant',
      });
      const empId = await createTestEmployee({ tenantId });

      const res = await app.request(
        `/api/v1/employees/${empId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${accessCookie}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({ expiresIn: '30d' }), // unapproved!
        },
        env
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('4. Public Token Verification (GET /api/v1/auth/invitations/:token)', () => {
    it('4.1 should reject invalid token with 404', async () => {
      const res = await app.request(
        '/api/v1/auth/invitations/invalid-fake-token-string-xyz',
        {
          method: 'GET',
          headers: { 'x-skip-rate-limit': 'true' },
        },
        env
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('INVITATION_NOT_FOUND');
    });

    it('4.2 should reject revoked token with 410', async () => {
      const { tenantId, userId } = await createTenantAndUser({
        email: 'admin.rev@srcodelab.space',
        tenantName: 'Revoke Tenant',
        tenantSlug: 'revoke-tenant',
      });
      const empId = await createTestEmployee({ tenantId });
      const db = createDb(env.DB);

      const { rawToken, invitation } = await InvitationsService.createInvitation(
        db,
        tenantId,
        empId,
        userId,
        { expiresIn: '7d' }
      );

      // Revoke the invitation
      await InvitationsService.revokeInvitation(db, tenantId, invitation.id, userId);

      const res = await app.request(
        `/api/v1/auth/invitations/${rawToken}`,
        {
          method: 'GET',
          headers: { 'x-skip-rate-limit': 'true' },
        },
        env
      );

      expect(res.status).toBe(410);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('INVITATION_REVOKED');
    });

    it('4.3 should successfully return safe public invitation metadata for a valid token', async () => {
      const { tenantId, userId } = await createTenantAndUser({
        email: 'admin.verify@srcodelab.space',
        tenantName: 'Verify Workspace Corp',
        tenantSlug: 'verify-workspace',
      });
      const empId = await createTestEmployee({
        tenantId,
        workEmail: 'valid.invitee@srcodelab.space',
      });
      const db = createDb(env.DB);

      const { rawToken } = await InvitationsService.createInvitation(
        db,
        tenantId,
        empId,
        userId,
        { expiresIn: '7d' }
      );

      const res = await app.request(
        `/api/v1/auth/invitations/${rawToken}`,
        {
          method: 'GET',
          headers: { 'x-skip-rate-limit': 'true' },
        },
        env
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.email).toBe('valid.invitee@srcodelab.space');
      expect(body.data.tenantName).toBe('Verify Workspace Corp');
      expect(body.data.firstName).toBe('Jane');
      expect(body.data.lastName).toBe('Doe');
      expect(body.data.roleName).toBe('Standard Employee');

      // Crucial: No internal IDs or sensitive tokens exposed
      expect(body.data.id).toBeUndefined();
      expect(body.data.tokenHash).toBeUndefined();
      expect(body.data.token).toBeUndefined();
      expect(body.data.tenantId).toBeUndefined();
    });
  });

  describe('5. Public Token Acceptance (POST /api/v1/auth/accept-invitation)', () => {
    it('5.1 should reject acceptance with weak password (< 8 chars) with 400', async () => {
      const res = await app.request(
        '/api/v1/auth/accept-invitation',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-skip-rate-limit': 'true',
          },
          body: JSON.stringify({
            token: 'some-token',
            password: 'short',
          }),
        },
        env
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('5.2 should successfully accept invitation, link employee, create membership, assign role, and issue auth cookies', async () => {
      const { tenantId, userId } = await createTenantAndUser({
        email: 'admin.accept@srcodelab.space',
        tenantName: 'Acceptance Tenant Corp',
        tenantSlug: 'acceptance-tenant',
      });
      const empId = await createTestEmployee({
        tenantId,
        workEmail: 'new.hire@srcodelab.space',
      });
      const db = createDb(env.DB);

      const { rawToken, invitation } = await InvitationsService.createInvitation(
        db,
        tenantId,
        empId,
        userId,
        { expiresIn: '7d' }
      );

      const acceptRes = await app.request(
        '/api/v1/auth/accept-invitation',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-skip-rate-limit': 'true',
          },
          body: JSON.stringify({
            token: rawToken,
            password: 'SecurePassword2026!',
            firstName: 'Janet',
            lastName: 'Hired',
          }),
        },
        env
      );

      expect(acceptRes.status).toBe(201);
      const body = (await acceptRes.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe('new.hire@srcodelab.space');
      expect(body.data.user.firstName).toBe('Janet');
      expect(body.data.user.lastName).toBe('Hired');
      expect(body.data.tenant.id).toBe(tenantId);
      expect(body.data.roles).toContain('EMPLOYEE');

      // Verify HttpOnly cookies were issued
      const accessCookie = extractCookie(acceptRes, 'sr_access');
      const refreshCookie = extractCookie(acceptRes, 'sr_refresh');
      expect(accessCookie).toBeDefined();
      expect(refreshCookie).toBeDefined();

      // Database verification:
      // 1. Employee record is now linked
      const updatedEmp = await db.query.employees.findFirst({
        where: eq(employees.id, empId),
      });
      expect(updatedEmp?.userId).toBe(body.data.user.id);

      // 2. Tenant membership is active
      const membership = await db.query.userTenants.findFirst({
        where: and(
          eq(userTenants.userId, body.data.user.id),
          eq(userTenants.tenantId, tenantId)
        ),
      });
      expect(membership).toBeDefined();
      expect(membership?.status).toBe('ACTIVE');
      expect(membership?.isDefault).toBe(true);

      // 3. User role assignment
      const assignedRole = await db.query.userRoles.findFirst({
        where: and(
          eq(userRoles.userId, body.data.user.id),
          eq(userRoles.tenantId, tenantId)
        ),
      });
      expect(assignedRole?.roleId).toBe(invitation.roleId);

      // 4. Invitation marked ACCEPTED
      const updatedInvite = await db.query.invitations.findFirst({
        where: eq(invitations.id, invitation.id),
      });
      expect(updatedInvite?.status).toBe('ACCEPTED');
      expect(updatedInvite?.acceptedAt).toBeDefined();

      // 5. Audit log recorded
      const auditEntry = await db.query.auditLogs.findFirst({
        where: and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.entityId, body.data.user.id)
        ),
      });
      expect(auditEntry).toBeDefined();
      expect(auditEntry?.action).toBe('CREATE');
      expect(auditEntry?.entityType).toBe('user');
    });

    it('5.3 should prevent token replay (second acceptance attempt fails with 409)', async () => {
      const { tenantId, userId } = await createTenantAndUser({
        email: 'admin.replay@srcodelab.space',
        tenantName: 'Replay Tenant',
        tenantSlug: 'replay-tenant',
      });
      const empId = await createTestEmployee({
        tenantId,
        workEmail: 'replay.target@srcodelab.space',
      });
      const db = createDb(env.DB);

      const { rawToken } = await InvitationsService.createInvitation(
        db,
        tenantId,
        empId,
        userId,
        { expiresIn: '7d' }
      );

      // First acceptance succeeds
      const firstRes = await app.request(
        '/api/v1/auth/accept-invitation',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-skip-rate-limit': 'true',
          },
          body: JSON.stringify({
            token: rawToken,
            password: 'SecurePassword2026!',
          }),
        },
        env
      );
      expect(firstRes.status).toBe(201);

      // Replay attempt fails with 409
      const replayRes = await app.request(
        '/api/v1/auth/accept-invitation',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-skip-rate-limit': 'true',
          },
          body: JSON.stringify({
            token: rawToken,
            password: 'AnotherPassword999!',
          }),
        },
        env
      );
      expect(replayRes.status).toBe(409);
      const body = (await replayRes.json()) as any;
      expect(body.error.code).toBe('INVITATION_ALREADY_ACCEPTED');
    });
  });

  describe('6. Public Registration Restrictions & Fallback Closure', () => {
    it('6.1 should strictly reject public registration once an initial user exists, ignoring setupKey', async () => {
      // 1. Initial bootstrap of first user
      const bootstrapRes = await app.request(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'first.admin@srcodelab.space',
            password: 'AdminPassword123!',
            firstName: 'First',
            lastName: 'Admin',
            tenantName: 'Initial Tenant',
          }),
        },
        env
      );
      expect(bootstrapRes.status).toBe(201);

      // 2. Subsequent registration attempt with previous hardcoded setup key MUST be rejected
      const bypassAttemptRes = await app.request(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'intruder@srcodelab.space',
            password: 'IntruderPassword123!',
            firstName: 'Intruder',
            lastName: 'Hacker',
            setupKey: 'SR_WORKSPACE_INITIAL_SETUP_KEY', // Old backdoor key
          }),
        },
        env
      );

      expect(bypassAttemptRes.status).toBe(403);
      const body = (await bypassAttemptRes.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('REGISTRATION_CLOSED');
    });
  });

  describe('7. Security & Zero Secret Leakage Verification', () => {
    it('7.1 should never expose raw tokens or token hashes in API responses', async () => {
      const { tenantId, accessCookie } = await createTenantAndUser({
        email: 'admin.leak@srcodelab.space',
        tenantName: 'Leak Test Workspace',
        tenantSlug: 'leak-test',
      });
      const empId = await createTestEmployee({
        tenantId,
        workEmail: 'leak.test@srcodelab.space',
      });

      // 1. Check POST /api/v1/employees/:id/invite response
      const inviteRes = await app.request(
        `/api/v1/employees/${empId}/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${accessCookie}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({ expiresIn: '7d' }),
        },
        env
      );

      const inviteBody = (await inviteRes.json()) as any;
      expect(inviteRes.status).toBe(201);
      expect(inviteBody.data.tokenHash).toBeUndefined();
      expect(inviteBody.data.token).toBeUndefined();
      expect(inviteBody.data.rawToken).toBeUndefined();

      // 2. Check audit logs to ensure token and hash were not logged
      const db = createDb(env.DB);
      const auditLog = await db.query.auditLogs.findFirst({
        where: and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.entityId, inviteBody.data.id)
        ),
      });

      expect(auditLog).toBeDefined();
      const auditChanges = JSON.parse(auditLog!.changes as string);
      expect(auditChanges.token).toBeUndefined();
      expect(auditChanges.rawToken).toBeUndefined();
      expect(auditChanges.tokenHash).toBeUndefined();
    });
  });
});
