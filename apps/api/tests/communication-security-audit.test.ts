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
  conversations,
  conversationMembers,
  messages,
  messageReactions,
  notifications,
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import type { Bindings } from '../src/types/env';

describe('Milestone 6 Phase D: Security & Integration Acceptance Audit', () => {
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

  async function loginUser(email: string, password = 'TestPassword123!') {
    const res = await app.request(
      'http://localhost/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-skip-rate-limit': 'true',
        },
        body: JSON.stringify({ email, password }),
      },
      env
    );
    expect(res.status).toBe(200);
    const token = extractCookie(res, 'sr_access');
    return token;
  }

  async function setupSecurityAuditEnvironment() {
    const db = createDb(env.DB);
    const tenantIdA = crypto.randomUUID();
    const tenantIdB = crypto.randomUUID();

    const passwordHash = await hashPassword('TestPassword123!');
    const userAdminA = crypto.randomUUID();
    const userAliceA = crypto.randomUUID();
    const userBobA = crypto.randomUUID();
    const userCharlieA = crypto.randomUUID(); // Member of tenant A, but not project member

    // Users in Tenant B
    const userAdminB = crypto.randomUUID();
    const userEveB = crypto.randomUUID();

    // User with inactive membership
    const userSuspended = crypto.randomUUID();

    await db.insert(users).values([
      {
        id: userAdminA,
        email: 'admin_a@comm-audit.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'Alpha',
        status: 'ACTIVE',
        emailVerified: true,
      },
      {
        id: userAliceA,
        email: 'alice_a@comm-audit.com',
        passwordHash,
        firstName: 'Alice',
        lastName: 'Alpha',
        status: 'ACTIVE',
        emailVerified: true,
      },
      {
        id: userBobA,
        email: 'bob_a@comm-audit.com',
        passwordHash,
        firstName: 'Bob',
        lastName: 'Alpha',
        status: 'ACTIVE',
        emailVerified: true,
      },
      {
        id: userCharlieA,
        email: 'charlie_a@comm-audit.com',
        passwordHash,
        firstName: 'Charlie',
        lastName: 'Alpha',
        status: 'ACTIVE',
        emailVerified: true,
      },
      {
        id: userAdminB,
        email: 'admin_b@comm-audit.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'Beta',
        status: 'ACTIVE',
        emailVerified: true,
      },
      {
        id: userEveB,
        email: 'eve_b@comm-audit.com',
        passwordHash,
        firstName: 'Eve',
        lastName: 'Beta',
        status: 'ACTIVE',
        emailVerified: true,
      },
      {
        id: userSuspended,
        email: 'suspended@comm-audit.com',
        passwordHash,
        firstName: 'Suspended',
        lastName: 'User',
        status: 'ACTIVE',
        emailVerified: true,
      },
    ]);

    await db.insert(tenants).values([
      {
        id: tenantIdA,
        name: 'Workspace Alpha',
        slug: 'workspace-alpha',
        status: 'ACTIVE',
        plan: 'ENTERPRISE',
      },
      {
        id: tenantIdB,
        name: 'Workspace Beta',
        slug: 'workspace-beta',
        status: 'ACTIVE',
        plan: 'PROFESSIONAL',
      },
    ]);

    // Roles
    const roleAdminA = crypto.randomUUID();
    const roleEmployeeA = crypto.randomUUID();
    const roleAdminB = crypto.randomUUID();
    const roleEmployeeB = crypto.randomUUID();

    await db.insert(roles).values([
      { id: roleAdminA, tenantId: tenantIdA, name: 'Tenant Admin', code: 'TENANT_ADMIN', roleType: 'SYSTEM' },
      { id: roleEmployeeA, tenantId: tenantIdA, name: 'Employee', code: 'EMPLOYEE', roleType: 'SYSTEM' },
      { id: roleAdminB, tenantId: tenantIdB, name: 'Tenant Admin', code: 'TENANT_ADMIN', roleType: 'SYSTEM' },
      { id: roleEmployeeB, tenantId: tenantIdB, name: 'Employee', code: 'EMPLOYEE', roleType: 'SYSTEM' },
    ]);

    // User Tenants
    await db.insert(userTenants).values([
      { id: crypto.randomUUID(), userId: userAdminA, tenantId: tenantIdA, status: 'ACTIVE', isDefault: true },
      { id: crypto.randomUUID(), userId: userAliceA, tenantId: tenantIdA, status: 'ACTIVE', isDefault: true },
      { id: crypto.randomUUID(), userId: userBobA, tenantId: tenantIdA, status: 'ACTIVE', isDefault: true },
      { id: crypto.randomUUID(), userId: userCharlieA, tenantId: tenantIdA, status: 'ACTIVE', isDefault: true },
      { id: crypto.randomUUID(), userId: userAdminB, tenantId: tenantIdB, status: 'ACTIVE', isDefault: true },
      { id: crypto.randomUUID(), userId: userEveB, tenantId: tenantIdB, status: 'ACTIVE', isDefault: true },
      { id: crypto.randomUUID(), userId: userSuspended, tenantId: tenantIdA, status: 'INACTIVE', isDefault: true },
    ]);

    // User Roles
    await db.insert(userRoles).values([
      { id: crypto.randomUUID(), userId: userAdminA, roleId: roleAdminA, tenantId: tenantIdA },
      { id: crypto.randomUUID(), userId: userAliceA, roleId: roleEmployeeA, tenantId: tenantIdA },
      { id: crypto.randomUUID(), userId: userBobA, roleId: roleEmployeeA, tenantId: tenantIdA },
      { id: crypto.randomUUID(), userId: userCharlieA, roleId: roleEmployeeA, tenantId: tenantIdA },
      { id: crypto.randomUUID(), userId: userAdminB, roleId: roleAdminB, tenantId: tenantIdB },
      { id: crypto.randomUUID(), userId: userEveB, roleId: roleEmployeeB, tenantId: tenantIdB },
      { id: crypto.randomUUID(), userId: userSuspended, roleId: roleEmployeeA, tenantId: tenantIdA },
    ]);

    // Employee & Project setup in Tenant A
    const empAliceId = crypto.randomUUID();
    const empBobId = crypto.randomUUID();
    const empCharlieId = crypto.randomUUID();

    await db.insert(employees).values([
      {
        id: empAliceId,
        tenantId: tenantIdA,
        employeeCode: 'EMP-SEC-01',
        firstName: 'Alice',
        lastName: 'Alpha',
        userId: userAliceA,
        employmentType: 'FULL_TIME',
        joiningDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
      {
        id: empBobId,
        tenantId: tenantIdA,
        employeeCode: 'EMP-SEC-02',
        firstName: 'Bob',
        lastName: 'Alpha',
        userId: userBobA,
        employmentType: 'FULL_TIME',
        joiningDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
      {
        id: empCharlieId,
        tenantId: tenantIdA,
        employeeCode: 'EMP-SEC-03',
        firstName: 'Charlie',
        lastName: 'Alpha',
        userId: userCharlieA,
        employmentType: 'FULL_TIME',
        joiningDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
    ]);

    const projectSecureId = crypto.randomUUID();
    await db.insert(projects).values({
      id: projectSecureId,
      tenantId: tenantIdA,
      projectCode: 'PRJ-SECURE-01',
      name: 'Project Confidential',
      status: 'ACTIVE',
      priority: 'URGENT',
      ownerEmployeeId: empAliceId,
      createdBy: userAliceA,
      updatedBy: userAliceA,
    });

    // Alice and Bob are project members, Charlie is NOT
    await db.insert(projectMembers).values([
      {
        id: crypto.randomUUID(),
        tenantId: tenantIdA,
        projectId: projectSecureId,
        employeeId: empAliceId,
        projectRole: 'PROJECT_MANAGER',
      },
      {
        id: crypto.randomUUID(),
        tenantId: tenantIdA,
        projectId: projectSecureId,
        employeeId: empBobId,
        projectRole: 'MEMBER',
      },
    ]);

    return {
      tenantIdA,
      tenantIdB,
      userAdminA,
      userAliceA,
      userBobA,
      userCharlieA,
      userAdminB,
      userEveB,
      userSuspended,
      projectSecureId,
      empAliceId,
      empBobId,
      empCharlieId,
    };
  }

  // ==========================================
  // SECTION 2: SECURITY & TENANT ISOLATION
  // ==========================================

  it('SEC-1: Cross-tenant conversation & message isolation (IDOR protection)', async () => {
    const s = await setupSecurityAuditEnvironment();
    const aliceToken = await loginUser('alice_a@comm-audit.com');
    const eveToken = await loginUser('eve_b@comm-audit.com');

    // Alice creates group in Tenant A
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ type: 'GROUP', name: 'Alpha Secret Strategy' }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Alice posts a confidential message
    const resMsg = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ content: 'Confidential Alpha credentials' }),
      },
      env
    );
    const msgId = ((await resMsg.json()) as any).data.id;

    // Eve attempts IDOR: read Tenant A conversation using Tenant B workspace
    const resEveGetConv = await app.request(
      `http://localhost/api/v1/conversations/${convId}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${eveToken}`,
          'X-Tenant-Id': s.tenantIdB,
        },
      },
      env
    );
    expect(resEveGetConv.status).toBe(404);

    // Eve attempts IDOR: read Tenant A messages using Tenant B workspace
    const resEveGetMsg = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${eveToken}`,
          'X-Tenant-Id': s.tenantIdB,
        },
      },
      env
    );
    expect(resEveGetMsg.status).toBe(404);

    // Eve attempts IDOR: edit Tenant A message
    const resEveEditMsg = await app.request(
      `http://localhost/api/v1/messages/${msgId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${eveToken}`,
          'X-Tenant-Id': s.tenantIdB,
        },
        body: JSON.stringify({ content: 'Tampered' }),
      },
      env
    );
    expect(resEveEditMsg.status).toBe(404);

    // Eve attempts IDOR: react to Tenant A message
    const resEveReact = await app.request(
      `http://localhost/api/v1/messages/${msgId}/reactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${eveToken}`,
          'X-Tenant-Id': s.tenantIdB,
        },
        body: JSON.stringify({ reaction: '🔥' }),
      },
      env
    );
    expect(resEveReact.status).toBe(404);
  });

  it('SEC-2: Unauthorized project discussion access prevention', async () => {
    const s = await setupSecurityAuditEnvironment();
    const aliceToken = await loginUser('alice_a@comm-audit.com');
    const charlieToken = await loginUser('charlie_a@comm-audit.com');

    // Charlie (NOT a project member) attempts to create conversation for Project Confidential
    const resCharlieCreate = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${charlieToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({
          type: 'PROJECT',
          projectId: s.projectSecureId,
        }),
      },
      env
    );
    expect(resCharlieCreate.status).toBe(403);
    const charlieCreateErr = ((await resCharlieCreate.json()) as any).error;
    expect(charlieCreateErr.code).toBe('NOT_PROJECT_MEMBER');

    // Alice (project manager) creates conversation -> succeeds
    const resAliceCreate = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({
          type: 'PROJECT',
          projectId: s.projectSecureId,
        }),
      },
      env
    );
    expect(resAliceCreate.status).toBe(201);
    const convId = ((await resAliceCreate.json()) as any).data.id;

    // Charlie attempts to view project conversation -> 403 Forbidden
    const resCharlieAccess = await app.request(
      `http://localhost/api/v1/conversations/${convId}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${charlieToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(resCharlieAccess.status).toBe(403);

    // Alice attempts to add Charlie (non-project member) to project conversation -> rejected 400
    const resAddCharlie = await app.request(
      `http://localhost/api/v1/conversations/${convId}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({
          userId: s.userCharlieA,
        }),
      },
      env
    );
    expect(resAddCharlie.status).toBe(400);
    const addErr = ((await resAddCharlie.json()) as any).error;
    expect(addErr.code).toBe('USER_NOT_PROJECT_MEMBER');
  });

  it('SEC-3: Inactive workspace membership rejection', async () => {
    const s = await setupSecurityAuditEnvironment();

    // Attempting login with suspended membership
    const suspendedToken = await loginUser('suspended@comm-audit.com');

    // Suspended user attempts to access tenant conversations
    const res = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${suspendedToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('TENANT_ACCESS_DENIED');
  });

  it('SEC-4: Unauthenticated access and invalid session rejection', async () => {
    const s = await setupSecurityAuditEnvironment();

    // 1. Missing cookie
    const resNoCookie = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'GET',
        headers: { 'X-Tenant-Id': s.tenantIdA },
      },
      env
    );
    expect(resNoCookie.status).toBe(401);

    // 2. Forged / invalid JWT token
    const resInvalidToken = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'GET',
        headers: {
          Cookie: 'sr_access=invalid.forged.token',
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(resInvalidToken.status).toBe(401);
  });

  // ==========================================
  // SECTION 3: MESSAGE LIFECYCLE
  // ==========================================

  it('MSG-1: Soft deletion preserves original message content in D1 and masks API responses', async () => {
    const s = await setupSecurityAuditEnvironment();
    const aliceToken = await loginUser('alice_a@comm-audit.com');
    const bobToken = await loginUser('bob_a@comm-audit.com');

    // Create group
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ type: 'GROUP', name: 'Audit Channel', participantUserIds: [s.userBobA] }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Alice posts message
    const originalText = 'Highly sensitive secret data to be audited';
    const resMsg = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ content: originalText }),
      },
      env
    );
    const msgId = ((await resMsg.json()) as any).data.id;

    // Alice soft deletes message
    const resDel = await app.request(
      `http://localhost/api/v1/messages/${msgId}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(resDel.status).toBe(200);

    // 1. Direct D1 inspection: Verify original text is STILL present in database
    const db = createDb(env.DB);
    const d1Record = await db.query.messages.findFirst({
      where: (m, { eq }) => eq(m.id, msgId),
    });
    expect(d1Record).toBeDefined();
    expect(d1Record!.content).toBe(originalText); // Intact in DB!
    expect(d1Record!.deletedAt).toBeInstanceOf(Date);

    // 2. API inspection: Verify response masks the content
    const resList = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    const listData = ((await resList.json()) as any).data;
    const maskedMsg = listData.items.find((m: any) => m.id === msgId);
    expect(maskedMsg.content).toBe('[This message was deleted]');
    expect(maskedMsg.isDeleted).toBe(true);
    expect(maskedMsg.deletedAt).toBeDefined();
  });

  it('MSG-2: Cross-conversation reply target rejection', async () => {
    const s = await setupSecurityAuditEnvironment();
    const aliceToken = await loginUser('alice_a@comm-audit.com');

    // Create 2 conversations in same tenant
    const resC1 = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ type: 'GROUP', name: 'Conv 1' }),
      },
      env
    );
    const convId1 = ((await resC1.json()) as any).data.id;

    const resC2 = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ type: 'GROUP', name: 'Conv 2' }),
      },
      env
    );
    const convId2 = ((await resC2.json()) as any).data.id;

    // Post message in Conv 1
    const resM1 = await app.request(
      `http://localhost/api/v1/conversations/${convId1}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ content: 'Msg in Conv 1' }),
      },
      env
    );
    const msgId1 = ((await resM1.json()) as any).data.id;

    // Attempt to post reply in Conv 2 targeting msgId1 from Conv 1 -> should fail 400
    const resCrossReply = await app.request(
      `http://localhost/api/v1/conversations/${convId2}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({
          content: 'Illegal cross-conversation reply',
          replyToMessageId: msgId1,
        }),
      },
      env
    );
    expect(resCrossReply.status).toBe(400);
    const replyErr = ((await resCrossReply.json()) as any).error;
    expect(replyErr.code).toBe('INVALID_REPLY_TARGET');
  });

  // ==========================================
  // SECTION 4: NOTIFICATION LIFECYCLE
  // ==========================================

  it('NOTIF-1: Notification isolation, individual & bulk read, and dismissal', async () => {
    const s = await setupSecurityAuditEnvironment();
    const aliceToken = await loginUser('alice_a@comm-audit.com');
    const bobToken = await loginUser('bob_a@comm-audit.com');
    const eveToken = await loginUser('eve_b@comm-audit.com');

    // Alice creates group with Bob
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ type: 'GROUP', name: 'Notification Chamber', participantUserIds: [s.userBobA] }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Alice sends 3 messages
    for (let i = 1; i <= 3; i++) {
      await app.request(
        `http://localhost/api/v1/conversations/${convId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${aliceToken}`,
            'X-Tenant-Id': s.tenantIdA,
          },
          body: JSON.stringify({ content: `Notification alert #${i}` }),
        },
        env
      );
    }

    // Bob lists notifications
    const resBobNotifs = await app.request(
      'http://localhost/api/v1/notifications',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(resBobNotifs.status).toBe(200);
    const notifs = ((await resBobNotifs.json()) as any).data.items;
    expect(notifs.length).toBeGreaterThanOrEqual(3);
    const firstNotifId = notifs[0].id;

    // Eve (Tenant B) attempts to read/dismiss Bob's notification -> 404 Not Found
    const resEveIDOR = await app.request(
      `http://localhost/api/v1/notifications/${firstNotifId}/read`,
      {
        method: 'PATCH',
        headers: {
          Cookie: `sr_access=${eveToken}`,
          'X-Tenant-Id': s.tenantIdB,
        },
      },
      env
    );
    expect(resEveIDOR.status).toBe(404);

    // Bob marks single notification as read
    const resMarkOne = await app.request(
      `http://localhost/api/v1/notifications/${firstNotifId}/read`,
      {
        method: 'PATCH',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(resMarkOne.status).toBe(200);
    expect(((await resMarkOne.json()) as any).data.isRead).toBe(true);

    // Bob deletes the notification
    const resDel = await app.request(
      `http://localhost/api/v1/notifications/${firstNotifId}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(resDel.status).toBe(200);

    // Bob marks all remaining as read
    const resMarkAll = await app.request(
      'http://localhost/api/v1/notifications/read-all',
      {
        method: 'POST',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(resMarkAll.status).toBe(200);

    // Verify Bob unread count is now 0
    const resCount = await app.request(
      'http://localhost/api/v1/notifications/unread-count',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(((await resCount.json()) as any).data.unreadCount).toBe(0);
  });

  it('NOTIF-2: Muted conversations suppress notifications', async () => {
    const s = await setupSecurityAuditEnvironment();
    const aliceToken = await loginUser('alice_a@comm-audit.com');
    const bobToken = await loginUser('bob_a@comm-audit.com');

    // Alice creates group with Bob
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ type: 'GROUP', name: 'Quiet Channel', participantUserIds: [s.userBobA] }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Bob mutes the conversation
    const resMute = await app.request(
      `http://localhost/api/v1/conversations/${convId}/mute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ muted: true }),
      },
      env
    );
    expect(resMute.status).toBe(200);
    const muteData = ((await resMute.json()) as any).data;
    expect(muteData.isMuted).toBe(true);

    // Clear any existing notifications for Bob
    await app.request(
      'http://localhost/api/v1/notifications/read-all',
      {
        method: 'POST',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );

    // Alice sends a message
    await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
        body: JSON.stringify({ content: 'Silent notification test' }),
      },
      env
    );

    // Verify Bob received 0 unread notifications!
    const resCount = await app.request(
      'http://localhost/api/v1/notifications/unread-count',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': s.tenantIdA,
        },
      },
      env
    );
    expect(((await resCount.json()) as any).data.unreadCount).toBe(0);
  });
});
