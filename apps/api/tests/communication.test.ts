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
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import type { Bindings } from '../src/types/env';

describe('Communication & Collaboration API Integration Tests', () => {
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

  async function getJson(res: Response): Promise<any> {
    return (await res.json()) as any;
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

  async function setupTestEnvironment() {
    const db = createDb(env.DB);
    const tenantIdA = crypto.randomUUID();
    const tenantIdB = crypto.randomUUID();

    // Create 3 users in Tenant A
    const passwordHash = await hashPassword('TestPassword123!');
    const userAdminId = crypto.randomUUID();
    const userAliceId = crypto.randomUUID();
    const userBobId = crypto.randomUUID();

    // User in Tenant B (cross-tenant)
    const userEveId = crypto.randomUUID();

    await db.insert(users).values([
      {
        id: userAdminId,
        email: 'admin@commtest.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        status: 'ACTIVE',
        emailVerified: true,
      },
      {
        id: userAliceId,
        email: 'alice@commtest.com',
        passwordHash,
        firstName: 'Alice',
        lastName: 'Smith',
        status: 'ACTIVE',
        emailVerified: true,
      },
      {
        id: userBobId,
        email: 'bob@commtest.com',
        passwordHash,
        firstName: 'Bob',
        lastName: 'Jones',
        status: 'ACTIVE',
        emailVerified: true,
      },
      {
        id: userEveId,
        email: 'eve@othertenant.com',
        passwordHash,
        firstName: 'Eve',
        lastName: 'Hacker',
        status: 'ACTIVE',
        emailVerified: true,
      },
    ]);

    await db.insert(tenants).values([
      {
        id: tenantIdA,
        name: 'Workspace Alpha',
        slug: 'alpha-workspace',
        status: 'ACTIVE',
        plan: 'ENTERPRISE',
      },
      {
        id: tenantIdB,
        name: 'Workspace Beta',
        slug: 'beta-workspace',
        status: 'ACTIVE',
        plan: 'PROFESSIONAL',
      },
    ]);

    // Roles
    const roleAdminId = crypto.randomUUID();
    const roleEmployeeId = crypto.randomUUID();
    const roleEveEmployeeId = crypto.randomUUID();

    await db.insert(roles).values([
      {
        id: roleAdminId,
        tenantId: tenantIdA,
        name: 'Tenant Admin',
        code: 'TENANT_ADMIN',
        roleType: 'SYSTEM',
      },
      {
        id: roleEmployeeId,
        tenantId: tenantIdA,
        name: 'Employee',
        code: 'EMPLOYEE',
        roleType: 'SYSTEM',
      },
      {
        id: roleEveEmployeeId,
        tenantId: tenantIdB,
        name: 'Employee',
        code: 'EMPLOYEE',
        roleType: 'SYSTEM',
      },
    ]);

    // User Tenants & Roles
    await db.insert(userTenants).values([
      {
        id: crypto.randomUUID(),
        userId: userAdminId,
        tenantId: tenantIdA,
        status: 'ACTIVE',
        isDefault: true,
      },
      {
        id: crypto.randomUUID(),
        userId: userAliceId,
        tenantId: tenantIdA,
        status: 'ACTIVE',
        isDefault: true,
      },
      {
        id: crypto.randomUUID(),
        userId: userBobId,
        tenantId: tenantIdA,
        status: 'ACTIVE',
        isDefault: true,
      },
      {
        id: crypto.randomUUID(),
        userId: userEveId,
        tenantId: tenantIdB,
        status: 'ACTIVE',
        isDefault: true,
      },
    ]);

    await db.insert(userRoles).values([
      {
        id: crypto.randomUUID(),
        userId: userAdminId,
        roleId: roleAdminId,
        tenantId: tenantIdA,
      },
      {
        id: crypto.randomUUID(),
        userId: userAliceId,
        roleId: roleEmployeeId,
        tenantId: tenantIdA,
      },
      {
        id: crypto.randomUUID(),
        userId: userBobId,
        roleId: roleEmployeeId,
        tenantId: tenantIdA,
      },
      {
        id: crypto.randomUUID(),
        userId: userEveId,
        roleId: roleEveEmployeeId,
        tenantId: tenantIdB,
      },
    ]);

    // Create an employee & project in Tenant A
    const empAliceId = crypto.randomUUID();
    await db.insert(employees).values({
      id: empAliceId,
      tenantId: tenantIdA,
      employeeCode: 'EMP-ALICE',
      firstName: 'Alice',
      lastName: 'Smith',
      userId: userAliceId,
      employmentType: 'FULL_TIME',
      joiningDate: new Date(),
      employmentStatus: 'ACTIVE',
    });

    const projectId = crypto.randomUUID();
    await db.insert(projects).values({
      id: projectId,
      tenantId: tenantIdA,
      projectCode: 'PRJ-ALPHA',
      name: 'Alpha Initiative',
      status: 'ACTIVE',
      priority: 'HIGH',
      ownerEmployeeId: empAliceId,
      createdBy: userAliceId,
      updatedBy: userAliceId,
    });

    // Alice is a project member
    await db.insert(projectMembers).values({
      id: crypto.randomUUID(),
      tenantId: tenantIdA,
      projectId,
      employeeId: empAliceId,
      projectRole: 'PROJECT_MANAGER',
    });

    return {
      tenantIdA,
      tenantIdB,
      userAdminId,
      userAliceId,
      userBobId,
      userEveId,
      projectId,
    };
  }

  it('1. should create direct conversation with canonical ordering and prevent duplicates', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');

    // Alice starts direct chat with Bob
    const res1 = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'DIRECT',
          participantUserIds: [setup.userBobId],
        }),
      },
      env
    );

    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as any;
    expect(body1.success).toBe(true);
    expect(body1.data.type).toBe('DIRECT');
    expect(body1.data.members.length).toBe(2);
    const convId = body1.data.id;

    // Bob starts direct chat with Alice -> should return SAME conversation (no duplicate)
    const bobToken = await loginUser('bob@commtest.com');
    const res2 = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'DIRECT',
          participantUserIds: [setup.userAliceId],
        }),
      },
      env
    );

    expect(res2.status).toBe(201);
    const body2 = (await res2.json()) as any;
    expect(body2.data.id).toBe(convId); // Exactly identical conversation ID
  });

  it('2. should enforce RBAC: employees can create groups but not channels without permission', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');

    // Alice creates group -> should succeed
    const resGroup = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'GROUP',
          name: 'Engineering Team',
          participantUserIds: [setup.userBobId],
        }),
      },
      env
    );

    expect(resGroup.status).toBe(201);
    const groupBody = (await resGroup.json()) as any;
    expect(groupBody.data.name).toBe('Engineering Team');

    // Alice attempts to create a public CHANNEL without permission -> should return 403 Forbidden
    const resChannel = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'CHANNEL',
          name: 'Announcements',
        }),
      },
      env
    );

    expect(resChannel.status).toBe(403);
    const channelBody = (await resChannel.json()) as any;
    expect(channelBody.error.code).toBe('RBAC_FORBIDDEN');

    // Admin creates channel -> should succeed
    const adminToken = await loginUser('admin@commtest.com');
    const resAdminChannel = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${adminToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'CHANNEL',
          name: 'General Announcements',
        }),
      },
      env
    );

    expect(resAdminChannel.status).toBe(201);
  });

  it('3. should support project conversation creation and link to existing project', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');

    const res = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'PROJECT',
          projectId: setup.projectId,
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.type).toBe('PROJECT');
    expect(body.data.projectId).toBe(setup.projectId);
    expect(body.data.project.projectCode).toBe('PRJ-ALPHA');
  });

  it('4. should enforce membership: non-members cannot read or post messages to private conversations', async () => {
    const setup = await setupTestEnvironment();
    const adminToken = await loginUser('admin@commtest.com');
    const aliceToken = await loginUser('alice@commtest.com');

    // Admin creates private group with only Admin in it
    const resGroup = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${adminToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'GROUP',
          name: 'Executive Strategy',
          participantUserIds: [],
        }),
      },
      env
    );
    const convId = ((await resGroup.json()) as any).data.id;

    // Alice (not a member) tries to get conversation details
    const resGet = await app.request(
      `http://localhost/api/v1/conversations/${convId}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    expect(resGet.status).toBe(403);

    // Alice tries to post message -> 403
    const resPost = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          content: 'Hello anyone there?',
        }),
      },
      env
    );
    expect(resPost.status).toBe(403);
  });

  it('5. should strictly enforce multi-tenant isolation for conversations, messages and notifications', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');
    const eveToken = await loginUser('eve@othertenant.com');

    // Alice creates group in Tenant A
    const resGroup = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'GROUP',
          name: 'Alpha Secret Group',
        }),
      },
      env
    );
    const convId = ((await resGroup.json()) as any).data.id;

    // Eve (in Tenant B) attempts to access Tenant A conversation with Tenant B header
    const resEve = await app.request(
      `http://localhost/api/v1/conversations/${convId}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${eveToken}`,
          'X-Tenant-Id': setup.tenantIdB,
        },
      },
      env
    );
    expect(resEve.status).toBe(404);

    // Eve attempts to switch header to Tenant A -> rejected by tenant middleware
    const resEveCross = await app.request(
      `http://localhost/api/v1/conversations/${convId}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${eveToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    expect(resEveCross.status).toBe(403);
  });

  it('6. should post messages, support replies, and update conversation lastMessage metadata', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');
    const bobToken = await loginUser('bob@commtest.com');

    // Alice creates group with Bob
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'GROUP',
          name: 'Product Discussion',
          participantUserIds: [setup.userBobId],
        }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Alice posts message 1
    const resMsg1 = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          content: 'Hey Bob, what do you think of Milestone 6?',
        }),
      },
      env
    );
    expect(resMsg1.status).toBe(201);
    const msg1 = ((await resMsg1.json()) as any).data;
    expect(msg1.content).toContain('Milestone 6');

    // Bob replies to message 1
    const resReply = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          content: 'It is fully production-quality!',
          replyToMessageId: msg1.id,
        }),
      },
      env
    );
    expect(resReply.status).toBe(201);
    const replyBody = ((await resReply.json()) as any).data;
    expect(replyBody.replyToMessageId).toBe(msg1.id);
    expect(replyBody.replyTo.content).toContain('Milestone 6');

    // Verify conversation updated metadata
    const resConvCheck = await app.request(
      `http://localhost/api/v1/conversations/${convId}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    const convCheck = ((await resConvCheck.json()) as any).data;
    expect(convCheck.lastMessagePreview).toBe('It is fully production-quality!');
  });

  it('7. should support message reactions and prevent duplicate identical reactions by same user', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');
    const bobToken = await loginUser('bob@commtest.com');

    // Alice creates group with Bob
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'GROUP',
          name: 'Feedback Chat',
          participantUserIds: [setup.userBobId],
        }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Alice sends message
    const resMsg = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ content: 'Launch ready!' }),
      },
      env
    );
    const msgId = ((await resMsg.json()) as any).data.id;

    // Bob reacts with 👍
    const resReact1 = await app.request(
      `http://localhost/api/v1/messages/${msgId}/reactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ reaction: '👍' }),
      },
      env
    );
    expect(resReact1.status).toBe(201);

    // Bob reacts again with 👍 -> idempotent success / duplicate prevention
    const resReactDup = await app.request(
      `http://localhost/api/v1/messages/${msgId}/reactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ reaction: '👍' }),
      },
      env
    );
    expect(resReactDup.status).toBe(201);

    // Bob reacts with ❤️ -> distinct reaction allowed
    const resReact2 = await app.request(
      `http://localhost/api/v1/messages/${msgId}/reactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ reaction: '❤️' }),
      },
      env
    );
    expect(resReact2.status).toBe(201);

    // Verify messages list includes both reactions
    const resList = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    const listBody = (await resList.json()) as any;
    const fetchedMsg = listBody.data.items[0];
    expect(fetchedMsg.reactions.length).toBe(2);
  });

  it('8. should support message editing and soft deletion with audit preservation', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');
    const bobToken = await loginUser('bob@commtest.com');

    // Alice creates group with Bob
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'GROUP',
          name: 'Editing Test Group',
          participantUserIds: [setup.userBobId],
        }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Alice posts message
    const resMsg = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ content: 'Original message typo' }),
      },
      env
    );
    const msgId = ((await resMsg.json()) as any).data.id;

    // Bob attempts to edit Alice's message -> 403 Forbidden
    const resBobEdit = await app.request(
      `http://localhost/api/v1/messages/${msgId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ content: 'Hacked message' }),
      },
      env
    );
    expect(resBobEdit.status).toBe(403);

    // Alice edits her own message -> 200 OK
    const resAliceEdit = await app.request(
      `http://localhost/api/v1/messages/${msgId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ content: 'Corrected message content' }),
      },
      env
    );
    expect(resAliceEdit.status).toBe(200);
    const editBody = (await resAliceEdit.json()) as any;
    expect(editBody.data.isEdited).toBe(true);

    // Alice soft-deletes her message -> 200 OK
    const resDelete = await app.request(
      `http://localhost/api/v1/messages/${msgId}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    expect(resDelete.status).toBe(200);

    // Verify messages list shows masked soft-deleted content
    const resList = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    const listData = (await resList.json()) as any;
    expect(listData.data.items[0].content).toBe('[This message was deleted]');
    expect(listData.data.items[0].isDeleted).toBe(true);
  });

  it('9. should support notifications, unread count and read-all operations', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');
    const bobToken = await loginUser('bob@commtest.com');

    // Alice creates group with Bob
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'GROUP',
          name: 'Notification Test Group',
          participantUserIds: [setup.userBobId],
        }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Alice sends 2 messages to trigger notifications for Bob
    await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ content: 'Ping 1' }),
      },
      env
    );
    await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ content: 'Ping 2' }),
      },
      env
    );

    // Bob checks unread count -> should be at least 2
    const resCount = await app.request(
      'http://localhost/api/v1/notifications/unread-count',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    expect(resCount.status).toBe(200);
    const countBody = (await resCount.json()) as any;
    expect(countBody.data.unreadCount).toBeGreaterThanOrEqual(2);

    // Bob marks all notifications as read
    const resReadAll = await app.request(
      'http://localhost/api/v1/notifications/read-all',
      {
        method: 'POST',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    expect(resReadAll.status).toBe(200);

    // Bob checks unread count again -> 0
    const resCountAfter = await app.request(
      'http://localhost/api/v1/notifications/unread-count',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${bobToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    expect(((await resCountAfter.json()) as any).data.unreadCount).toBe(0);
  });

  it('10. should validate cursor pagination with messages sharing timestamps', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');

    // Create channel
    const adminToken = await loginUser('admin@commtest.com');
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${adminToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'CHANNEL',
          name: 'Cursor Channel',
        }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Post 5 messages
    for (let i = 1; i <= 5; i++) {
      await app.request(
        `http://localhost/api/v1/conversations/${convId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `sr_access=${adminToken}`,
            'X-Tenant-Id': setup.tenantIdA,
          },
          body: JSON.stringify({ content: `Message number ${i}` }),
        },
        env
      );
    }

    // Query with limit = 2
    const resP1 = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages?limit=2`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${adminToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    expect(resP1.status).toBe(200);
    const page1 = (await resP1.json()) as any;
    expect(page1.data.items.length).toBe(2);
    expect(page1.data.pagination.hasMore).toBe(true);
    expect(page1.data.pagination.prevCursor).toBeDefined();

    // Query older messages with before cursor
    const resP2 = await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages?limit=2&before=${page1.data.pagination.prevCursor}`,
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${adminToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    expect(resP2.status).toBe(200);
    const page2 = (await resP2.json()) as any;
    expect(page2.data.items.length).toBe(2);
  });

  it('11. should search messages across accessible conversations', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');

    // Create group
    const resConv = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({
          type: 'GROUP',
          name: 'Searchable Group',
        }),
      },
      env
    );
    const convId = ((await resConv.json()) as any).data.id;

    // Post message with unique keyword
    await app.request(
      `http://localhost/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ content: 'Antigravity quantum deploy is underway.' }),
      },
      env
    );

    // Search for "quantum"
    const resSearch = await app.request(
      'http://localhost/api/v1/messages/search?query=quantum',
      {
        method: 'GET',
        headers: {
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
      },
      env
    );
    expect(resSearch.status).toBe(200);
    const searchBody = (await resSearch.json()) as any;
    expect(searchBody.data.items.length).toBe(1);
    expect(searchBody.data.items[0].content).toContain('quantum');
  });

  it('12. should reject invalid and malformed requests with 400 Bad Request', async () => {
    const setup = await setupTestEnvironment();
    const aliceToken = await loginUser('alice@commtest.com');

    // 1. Empty message content
    const resEmpty = await app.request(
      'http://localhost/api/v1/conversations/non-existent/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ content: '' }),
      },
      env
    );
    expect(resEmpty.status).toBe(400);

    // 2. Message exceeding 5000 characters
    const longContent = 'A'.repeat(5001);
    const resLong = await app.request(
      'http://localhost/api/v1/conversations/non-existent/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: JSON.stringify({ content: longContent }),
      },
      env
    );
    expect(resLong.status).toBe(400);

    // 3. Invalid JSON body
    const resBadJson = await app.request(
      'http://localhost/api/v1/conversations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sr_access=${aliceToken}`,
          'X-Tenant-Id': setup.tenantIdA,
        },
        body: '{invalid json',
      },
      env
    );
    expect(resBadJson.status).toBe(400);
  });
});
