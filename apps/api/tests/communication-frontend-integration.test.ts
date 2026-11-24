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
  projects,
  departments,
  employees,
  projectMembers,
  conversations,
  conversationMembers,
  messages,
  notifications,
} from '@sr-workspace/database';
import { hashPassword } from '../src/lib/crypto';
import type { Bindings } from '../src/types/env';

/**
 * Normalization helper replica from @/lib/normalize.ts
 */
function extractItems<T>(response: unknown): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (typeof response === 'object') {
    const obj = response as Record<string, any>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.data)) return obj.data;
    if (obj.data && typeof obj.data === 'object' && Array.isArray(obj.data.items)) {
      return obj.data.items;
    }
  }
  return [];
}

describe('Milestone 6 Phase E: Communication Frontend Integration Tests', () => {
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

  async function setupWorkspaceAndUsers() {
    const db = createDb(env.DB);
    const tenantId = 't-fe-audit-1';
    const deptId = 'd-fe-1';
    const projId = 'p-fe-1';

    // Tenant & Department
    await db.insert(tenants).values({
      id: tenantId,
      name: 'Frontend Test Workspace',
      slug: 'fe-test-ws',
      status: 'ACTIVE',
      plan: 'ENTERPRISE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(departments).values({
      id: deptId,
      tenantId,
      name: 'Engineering',
      code: 'ENG',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Roles
    await db.insert(roles).values([
      { id: 'r-admin', tenantId, name: 'Tenant Admin', code: 'TENANT_ADMIN', roleType: 'SYSTEM' },
      { id: 'r-emp', tenantId, name: 'Employee', code: 'EMPLOYEE', roleType: 'SYSTEM' },
    ]);

    const pwHash = await hashPassword('Password123!');

    // User 1: Alice (Admin)
    const aliceId = 'u-alice-fe';
    await db.insert(users).values({
      id: aliceId,
      email: 'alice.fe@srworkspace.com',
      passwordHash: pwHash,
      firstName: 'Alice',
      lastName: 'Smith',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(userTenants).values({
      id: 'ut-alice',
      userId: aliceId,
      tenantId,
      status: 'ACTIVE',
      joinedAt: new Date(),
    });
    await db.insert(userRoles).values({
      id: 'ur-alice',
      userId: aliceId,
      tenantId,
      roleId: 'r-admin',
    });

    // User 2: Bob (Employee)
    const bobId = 'u-bob-fe';
    await db.insert(users).values({
      id: bobId,
      email: 'bob.fe@srworkspace.com',
      passwordHash: pwHash,
      firstName: 'Bob',
      lastName: 'Jones',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(userTenants).values({
      id: 'ut-bob',
      userId: bobId,
      tenantId,
      status: 'ACTIVE',
      joinedAt: new Date(),
    });
    await db.insert(userRoles).values({
      id: 'ur-bob',
      userId: bobId,
      tenantId,
      roleId: 'r-emp',
    });

    // Employees mapping
    const empAliceId = 'emp-alice-fe';
    const empBobId = 'emp-bob-fe';
    await db.insert(employees).values([
      {
        id: empAliceId,
        tenantId,
        userId: aliceId,
        departmentId: deptId,
        employeeCode: 'EMP-001',
        firstName: 'Alice',
        lastName: 'Smith',
        workEmail: 'alice.fe@srworkspace.com',
        employmentType: 'FULL_TIME',
        employmentStatus: 'ACTIVE',
        joiningDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: empBobId,
        tenantId,
        userId: bobId,
        departmentId: deptId,
        employeeCode: 'EMP-002',
        firstName: 'Bob',
        lastName: 'Jones',
        workEmail: 'bob.fe@srworkspace.com',
        employmentType: 'FULL_TIME',
        employmentStatus: 'ACTIVE',
        joiningDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Project & Project Members
    await db.insert(projects).values({
      id: projId,
      tenantId,
      ownerEmployeeId: empAliceId,
      name: 'Mobile App Redesign',
      projectCode: 'MOB-01',
      status: 'ACTIVE',
      priority: 'HIGH',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(projectMembers).values({
      id: 'pm-alice',
      tenantId,
      projectId: projId,
      employeeId: empAliceId,
      projectRole: 'PROJECT_MANAGER',
      addedBy: aliceId,
    });
    await db.insert(projectMembers).values({
      id: 'pm-bob',
      tenantId,
      projectId: projId,
      employeeId: empBobId,
      projectRole: 'MEMBER',
      addedBy: aliceId,
    });

    // Login Alice
    const aliceLogin = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice.fe@srworkspace.com', password: 'Password123!' }),
      },
      env
    );
    const aliceCookie = extractCookie(aliceLogin, 'sr_access');

    // Login Bob
    const bobLogin = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob.fe@srworkspace.com', password: 'Password123!' }),
      },
      env
    );
    const bobCookie = extractCookie(bobLogin, 'sr_access');

    return {
      tenantId,
      aliceId,
      bobId,
      projId,
      aliceCookie: `sr_access=${aliceCookie}`,
      bobCookie: `sr_access=${bobCookie}`,
    };
  }

  // 1. Conversation listing & filters
  it('FE-1: should list conversations, support tab filters, and extract items with normalizer', async () => {
    const { aliceCookie, bobId, projId } = await setupWorkspaceAndUsers();

    // Alice creates DIRECT conversation with Bob
    const dRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ type: 'DIRECT', participantUserIds: [bobId] }),
      },
      env
    );
    expect(dRes.status).toBe(201);

    // Alice creates CHANNEL
    const cRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ type: 'CHANNEL', name: 'announcements', description: 'Company-wide' }),
      },
      env
    );
    expect(cRes.status).toBe(201);

    // List all
    const allRes = await app.request('/api/v1/conversations', { headers: { Cookie: aliceCookie } }, env);
    expect(allRes.status).toBe(200);
    const allBody = ((await allRes.json()) as any);
    const allItems: any[] = extractItems(allBody.data);
    expect(allItems.length).toBe(2);

    // Filter by DIRECT tab
    const dirRes = await app.request('/api/v1/conversations?type=DIRECT', { headers: { Cookie: aliceCookie } }, env);
    const dirBody = ((await dirRes.json()) as any);
    const dirItems: any[] = extractItems(dirBody.data);
    expect(dirItems.length).toBe(1);
    expect(dirItems[0].type).toBe('DIRECT');

    // Filter by CHANNEL tab
    const chRes = await app.request('/api/v1/conversations?type=CHANNEL', { headers: { Cookie: aliceCookie } }, env);
    const chBody = ((await chRes.json()) as any);
    const chItems: any[] = extractItems(chBody.data);
    expect(chItems.length).toBe(1);
    expect(chItems[0].type).toBe('CHANNEL');
  });

  // 2. Conversation creation & RBAC visibility
  it('FE-2: should enforce RBAC on conversation creation (channels require admin/permission)', async () => {
    const { bobCookie } = await setupWorkspaceAndUsers();

    // Bob (EMPLOYEE) attempts to create a CHANNEL -> should receive 403 RBAC_FORBIDDEN
    const chRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
        body: JSON.stringify({ type: 'CHANNEL', name: 'secret-channel' }),
      },
      env
    );
    expect(chRes.status).toBe(403);
    const chBody = ((await chRes.json()) as any);
    expect(chBody.error.code).toBe('RBAC_FORBIDDEN');

    // Bob can create a GROUP conversation
    const grpRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
        body: JSON.stringify({ type: 'GROUP', name: 'Frontend Guild' }),
      },
      env
    );
    expect(grpRes.status).toBe(201);
  });

  // 3. Message sending, lastMessage metadata, and reply functionality
  it('FE-3: should send messages, update lastMessage preview, and post replies', async () => {
    const { aliceCookie, bobCookie, bobId } = await setupWorkspaceAndUsers();

    // Create Direct conversation
    const cRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ type: 'DIRECT', participantUserIds: [bobId] }),
      },
      env
    );
    const convId = ((await cRes.json()) as any).data.id;

    // Alice posts Message 1
    const m1Res = await app.request(
      `/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: 'Hello Bob! How is Milestone 6?' }),
      },
      env
    );
    expect(m1Res.status).toBe(201);
    const msg1 = ((await m1Res.json()) as any).data;

    // Bob posts Reply to Message 1
    const m2Res = await app.request(
      `/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
        body: JSON.stringify({
          content: 'Hi Alice! Frontend is coming along nicely.',
          replyToMessageId: msg1.id,
        }),
      },
      env
    );
    expect(m2Res.status).toBe(201);
    const msg2 = ((await m2Res.json()) as any).data;

    expect(msg2.replyToMessageId).toBe(msg1.id);

    // Verify conversation lastMessage metadata is updated
    const convDetail = await app.request(`/api/v1/conversations/${convId}`, { headers: { Cookie: aliceCookie } }, env);
    const convData = ((await convDetail.json()) as any).data;
    expect(convData.lastMessagePreview).toBe('Hi Alice! Frontend is coming along nicely.');
  });

  // 4. Message pagination (cursor backward history)
  it('FE-4: should support cursor pagination for loading older message history', async () => {
    const { aliceCookie, bobId } = await setupWorkspaceAndUsers();

    const cRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ type: 'DIRECT', participantUserIds: [bobId] }),
      },
      env
    );
    const convId = ((await cRes.json()) as any).data.id;

    // Post 3 messages sequentially
    for (let i = 1; i <= 3; i++) {
      await app.request(
        `/api/v1/conversations/${convId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
          body: JSON.stringify({ content: `Batch message #${i}` }),
        },
        env
      );
    }

    // Fetch initial page with limit=2
    const page1Res = await app.request(
      `/api/v1/conversations/${convId}/messages?limit=2`,
      { headers: { Cookie: aliceCookie } },
      env
    );
    const page1Data = ((await page1Res.json()) as any).data;
    expect(page1Data.items.length).toBe(2);
    expect(page1Data.pagination.hasMore).toBe(true);

    // Fetch older history with before cursor
    const prevCursor = page1Data.pagination.prevCursor;
    const page2Res = await app.request(
      `/api/v1/conversations/${convId}/messages?limit=2&before=${prevCursor}`,
      { headers: { Cookie: aliceCookie } },
      env
    );
    const page2Data = ((await page2Res.json()) as any).data;
    expect(page2Data.items.length).toBe(1);
    expect(page2Data.items[0].content).toBe('Batch message #1');
  });

  // 5. Message editing and soft-deletion
  it('FE-5: should edit message and soft-delete preserving content in D1 and masking in API', async () => {
    const { aliceCookie, bobCookie, bobId } = await setupWorkspaceAndUsers();

    const cRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ type: 'DIRECT', participantUserIds: [bobId] }),
      },
      env
    );
    const convId = ((await cRes.json()) as any).data.id;

    // Alice creates message
    const mRes = await app.request(
      `/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: 'Original text draft' }),
      },
      env
    );
    const msgId = ((await mRes.json()) as any).data.id;

    // Alice edits message
    const editRes = await app.request(
      `/api/v1/messages/${msgId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: 'Revised final text' }),
      },
      env
    );
    expect(editRes.status).toBe(200);
    const editedMsg = ((await editRes.json()) as any).data;
    expect(editedMsg.content).toBe('Revised final text');
    expect(editedMsg.isEdited).toBe(true);

    // Alice soft-deletes message
    const delRes = await app.request(
      `/api/v1/messages/${msgId}`,
      {
        method: 'DELETE',
        headers: { Cookie: aliceCookie },
      },
      env
    );
    expect(delRes.status).toBe(200);

    // Bob reads conversation: content is masked as '[This message was deleted]'
    const listRes = await app.request(
      `/api/v1/conversations/${convId}/messages`,
      { headers: { Cookie: bobCookie } },
      env
    );
    const listData = ((await listRes.json()) as any).data;
    expect(listData.items[0].content).toBe('[This message was deleted]');
    expect(listData.items[0].isDeleted).toBe(true);
  });

  // 6. Emoji reactions
  it('FE-6: should add, count, and remove reactions idempotently', async () => {
    const { aliceCookie, bobCookie, bobId } = await setupWorkspaceAndUsers();

    const cRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ type: 'DIRECT', participantUserIds: [bobId] }),
      },
      env
    );
    const convId = ((await cRes.json()) as any).data.id;

    const mRes = await app.request(
      `/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: 'Look at this release!' }),
      },
      env
    );
    const msgId = ((await mRes.json()) as any).data.id;

    // Bob reacts with 🚀
    const r1 = await app.request(
      `/api/v1/messages/${msgId}/reactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
        body: JSON.stringify({ reaction: '🚀' }),
      },
      env
    );
    expect(r1.status).toBe(201);

    // Check message reactions in list
    const check1 = await app.request(`/api/v1/conversations/${convId}/messages`, { headers: { Cookie: bobCookie } }, env);
    const mData1 = ((await check1.json()) as any).data.items[0];
    expect(mData1.reactions.length).toBe(1);
    expect(mData1.reactions[0].reaction).toBe('🚀');
    expect(mData1.reactions[0].count).toBe(1);
    expect(mData1.reactions[0].hasReacted).toBe(true);

    // Bob removes reaction
    const r2 = await app.request(
      `/api/v1/messages/${msgId}/reactions`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
        body: JSON.stringify({ reaction: '🚀' }),
      },
      env
    );
    expect(r2.status).toBe(200);

    const check2 = await app.request(`/api/v1/conversations/${convId}/messages`, { headers: { Cookie: bobCookie } }, env);
    const mData2 = ((await check2.json()) as any).data.items[0];
    expect(mData2.reactions.length).toBe(0);
  });

  // 7. Notification lifecycle: listing, unread-count, read-all, dismiss
  it('FE-7: should track unread notifications count, batch mark-as-read, and dismiss', async () => {
    const { aliceCookie, bobCookie, bobId } = await setupWorkspaceAndUsers();

    // Alice creates group and invites Bob
    const gRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ type: 'GROUP', name: 'Design Team', participantUserIds: [bobId] }),
      },
      env
    );
    const convId = ((await gRes.json()) as any).data.id;

    // Alice posts a message -> generates notification for Bob
    await app.request(
      `/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: 'Welcome to Design Team Bob!' }),
      },
      env
    );

    // Bob checks unread notification count
    const countRes = await app.request('/api/v1/notifications/unread-count', { headers: { Cookie: bobCookie } }, env);
    expect(countRes.status).toBe(200);
    const countData = ((await countRes.json()) as any).data;
    expect(countData.unreadCount).toBeGreaterThanOrEqual(1);

    // Bob lists notifications
    const listRes = await app.request('/api/v1/notifications', { headers: { Cookie: bobCookie } }, env);
    const listData = ((await listRes.json()) as any).data;
    const notifItem = listData.items[0];
    expect(notifItem.isRead).toBe(false);

    // Bob marks all notifications as read
    const readAllRes = await app.request(
      '/api/v1/notifications/read-all',
      { method: 'POST', headers: { Cookie: bobCookie } },
      env
    );
    expect(readAllRes.status).toBe(200);

    // Unread count is now 0
    const countAfter = await app.request('/api/v1/notifications/unread-count', { headers: { Cookie: bobCookie } }, env);
    expect(((await countAfter.json()) as any).data.unreadCount).toBe(0);

    // Bob dismisses notification
    const delRes = await app.request(
      `/api/v1/notifications/${notifItem.id}`,
      { method: 'DELETE', headers: { Cookie: bobCookie } },
      env
    );
    expect(delRes.status).toBe(200);
  });

  // 8. Delta polling synchronization and duplicate prevention
  it('FE-8: should support forward delta polling via since cursor without duplicate messages', async () => {
    const { aliceCookie, bobCookie, bobId } = await setupWorkspaceAndUsers();

    const cRes = await app.request(
      '/api/v1/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ type: 'DIRECT', participantUserIds: [bobId] }),
      },
      env
    );
    const convId = ((await cRes.json()) as any).data.id;

    // Post initial message
    await app.request(
      `/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: 'Initial message' }),
      },
      env
    );

    // Bob fetches initial messages and gets nextCursor
    const initRes = await app.request(`/api/v1/conversations/${convId}/messages`, { headers: { Cookie: bobCookie } }, env);
    const initData = ((await initRes.json()) as any).data;
    expect(initData.items.length).toBe(1);
    const newestCursor = initData.pagination.nextCursor;

    // Alice posts a subsequent message
    await app.request(
      `/api/v1/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: 'Delta update message' }),
      },
      env
    );

    // Bob polls forward using since=newestCursor
    const pollRes = await app.request(
      `/api/v1/conversations/${convId}/messages?since=${newestCursor}`,
      { headers: { Cookie: bobCookie } },
      env
    );
    const pollData = ((await pollRes.json()) as any).data;
    expect(pollData.items.length).toBe(1);
    expect(pollData.items[0].content).toBe('Delta update message');
  });

  // 9. API error formatting and validation
  it('FE-9: should return standard error envelopes on invalid request bodies', async () => {
    const { aliceCookie } = await setupWorkspaceAndUsers();

    // Empty content message
    const errRes = await app.request(
      '/api/v1/conversations/invalid-conv-id/messages',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ content: '   ' }), // whitespace only
      },
      env
    );
    expect(errRes.status).toBe(400);
    const errBody = ((await errRes.json()) as any);
    expect(errBody.success).toBe(false);
    expect(errBody.error.code).toBe('VALIDATION_ERROR');
  });
});
