import { DatabaseSync } from 'node:sqlite';
import { hashSync, genSaltSync } from '../node_modules/.pnpm/bcrypt-ts@5.0.3/node_modules/bcrypt-ts/dist/node.mjs';

const API_BASE = 'http://127.0.0.1:8787/api/v1';
const DB_PATH = 'apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9b75c6a3fa194222caa4b69ae41bd3ea54926321786b5dac259f1f032c1482e0.sqlite';

const db = new DatabaseSync(DB_PATH);

console.log('=== STARTING MILESTONE 6 END-TO-END ACCEPTANCE AUDIT ===\n');

async function run() {
  const auditTenantId = 't-acceptance-' + Date.now();
  const aliceUserId = 'u-acceptance-alice-' + Date.now();
  const bobUserId = 'u-acceptance-bob-' + Date.now();
  const adminRoleId = 'r-acceptance-admin-' + Date.now();
  const empRoleId = 'r-acceptance-emp-' + Date.now();
  const deptId = 'd-acceptance-' + Date.now();
  const projId = 'p-acceptance-' + Date.now();
  const aliceEmpId = 'emp-acceptance-alice-' + Date.now();
  const bobEmpId = 'emp-acceptance-bob-' + Date.now();

  const nowMs = Date.now();
  const passwordHash = hashSync('Password123!', 8);

  console.log('1. Setting up acceptance workspace and 2 test users directly in local D1 SQLite...');
  
  // Insert Tenant
  db.prepare(`
    INSERT INTO tenants (id, name, slug, status, plan, created_at, updated_at)
    VALUES (?, ?, ?, 'ACTIVE', 'ENTERPRISE', ?, ?)
  `).run(auditTenantId, 'Milestone 6 Acceptance Workspace', 'm6-accept-' + nowMs, nowMs, nowMs);

  // Insert Department
  db.prepare(`
    INSERT INTO departments (id, tenant_id, name, code, status, created_at, updated_at)
    VALUES (?, ?, 'Product Development', 'PROD', 'ACTIVE', ?, ?)
  `).run(deptId, auditTenantId, nowMs, nowMs);

  // Insert Roles
  db.prepare(`
    INSERT INTO roles (id, tenant_id, name, code, role_type, created_at, updated_at)
    VALUES (?, ?, 'Tenant Administrator', 'TENANT_ADMIN', 'SYSTEM', ?, ?)
  `).run(adminRoleId, auditTenantId, nowMs, nowMs);

  db.prepare(`
    INSERT INTO roles (id, tenant_id, name, code, role_type, created_at, updated_at)
    VALUES (?, ?, 'Employee', 'EMPLOYEE', 'SYSTEM', ?, ?)
  `).run(empRoleId, auditTenantId, nowMs, nowMs);

  // Insert Alice (Admin) & Bob (Employee)
  db.prepare(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, status, created_at, updated_at)
    VALUES (?, ?, ?, 'Alice', 'Acceptance', 'ACTIVE', ?, ?)
  `).run(aliceUserId, `alice.${nowMs}@srcodelab.space`, passwordHash, nowMs, nowMs);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, status, created_at, updated_at)
    VALUES (?, ?, ?, 'Bob', 'Acceptance', 'ACTIVE', ?, ?)
  `).run(bobUserId, `bob.${nowMs}@srcodelab.space`, passwordHash, nowMs, nowMs);

  // Insert user_tenants
  db.prepare(`
    INSERT INTO user_tenants (id, user_id, tenant_id, is_default, status, joined_at)
    VALUES (?, ?, ?, 1, 'ACTIVE', ?)
  `).run('ut-alice-' + nowMs, aliceUserId, auditTenantId, nowMs);

  db.prepare(`
    INSERT INTO user_tenants (id, user_id, tenant_id, is_default, status, joined_at)
    VALUES (?, ?, ?, 1, 'ACTIVE', ?)
  `).run('ut-bob-' + nowMs, bobUserId, auditTenantId, nowMs);

  // Insert user_roles
  db.prepare(`
    INSERT INTO user_roles (id, user_id, tenant_id, role_id, assigned_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('ur-alice-' + nowMs, aliceUserId, auditTenantId, adminRoleId, nowMs);

  db.prepare(`
    INSERT INTO user_roles (id, user_id, tenant_id, role_id, assigned_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('ur-bob-' + nowMs, bobUserId, auditTenantId, empRoleId, nowMs);

  // Insert employees
  db.prepare(`
    INSERT INTO employees (id, tenant_id, user_id, department_id, employee_code, first_name, last_name, work_email, employment_type, employment_status, joining_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'Alice', 'Acceptance', ?, 'FULL_TIME', 'ACTIVE', ?, ?, ?)
  `).run(aliceEmpId, auditTenantId, aliceUserId, deptId, 'EMP-A-' + (nowMs % 10000), `alice.${nowMs}@srcodelab.space`, nowMs, nowMs, nowMs);

  db.prepare(`
    INSERT INTO employees (id, tenant_id, user_id, department_id, employee_code, first_name, last_name, work_email, employment_type, employment_status, joining_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'Bob', 'Acceptance', ?, 'FULL_TIME', 'ACTIVE', ?, ?, ?)
  `).run(bobEmpId, auditTenantId, bobUserId, deptId, 'EMP-B-' + (nowMs % 10000), `bob.${nowMs}@srcodelab.space`, nowMs, nowMs, nowMs);

  // Insert project & project_members
  db.prepare(`
    INSERT INTO projects (id, tenant_id, name, project_code, status, priority, owner_employee_id, created_at, updated_at)
    VALUES (?, ?, 'Cloud Infrastructure v2', ?, 'ACTIVE', 'HIGH', ?, ?, ?)
  `).run(projId, auditTenantId, 'INF-' + (nowMs % 1000), aliceEmpId, nowMs, nowMs);

  db.prepare(`
    INSERT INTO project_members (id, tenant_id, project_id, employee_id, project_role, added_by, created_at)
    VALUES (?, ?, ?, ?, 'PROJECT_MANAGER', ?, ?)
  `).run('pm-alice-' + nowMs, auditTenantId, projId, aliceEmpId, aliceUserId, nowMs);

  console.log('   ✓ Seeded acceptance workspace, 2 users, project, and permissions in local D1.\n');

  // Helper for requests
  function extractCookie(res, cookieName) {
    const rawCookies = res.headers.getSetCookie?.() || [res.headers.get('set-cookie') || ''];
    for (const c of rawCookies) {
      for (const segment of c.split(',')) {
        const trimmed = segment.trim().split(';')[0];
        if (trimmed.startsWith(cookieName + '=')) {
          return trimmed.slice((cookieName + '=').length);
        }
      }
    }
    return '';
  }

  // 2. Login Alice and Bob
  console.log('2. Authenticating User Alice (Admin) and User Bob (Employee)...');
  const aliceLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `alice.${nowMs}@srcodelab.space`, password: 'Password123!' }),
  });
  if (aliceLoginRes.status !== 200) throw new Error('Alice login failed: ' + await aliceLoginRes.text());
  const aliceToken = extractCookie(aliceLoginRes, 'sr_access');

  const bobLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `bob.${nowMs}@srcodelab.space`, password: 'Password123!' }),
  });
  if (bobLoginRes.status !== 200) throw new Error('Bob login failed: ' + await bobLoginRes.text());
  const bobToken = extractCookie(bobLoginRes, 'sr_access');

  const aliceHeaders = { 'Content-Type': 'application/json', Cookie: `sr_access=${aliceToken}` };
  const bobHeaders = { 'Content-Type': 'application/json', Cookie: `sr_access=${bobToken}` };

  console.log('   ✓ Both users authenticated. Session cookies received.\n');

  // 3. Test Direct Conversation Singleton
  console.log('3. Testing Direct Conversation creation & singleton uniqueness...');
  const directRes1 = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ type: 'DIRECT', participantUserIds: [bobUserId] }),
  });
  const direct1 = (await directRes1.json()).data;
  console.log(`   ✓ Alice created 1-on-1 direct conversation with Bob: ID = ${direct1.id}`);

  // Bob requests direct conversation with Alice -> must return the EXACT same conversation
  const directRes2 = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({ type: 'DIRECT', participantUserIds: [aliceUserId] }),
  });
  const direct2 = (await directRes2.json()).data;
  console.log(`   ✓ Bob requested direct conversation with Alice: ID = ${direct2.id}`);
  if (direct1.id !== direct2.id) {
    throw new Error(`Singleton violation! Expected ${direct1.id} but received ${direct2.id}`);
  }
  console.log('   ✓ Direct conversation singleton verified successfully!\n');

  // 4. Test Message Sending, Receiving, Replies, Reactions
  console.log('4. Testing Message Lifecycle (Send, Receive, Reply, Reaction)...');
  const msg1Res = await fetch(`${API_BASE}/conversations/${direct1.id}/messages`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ content: 'Hello Bob! This is message #1 from Alice.' }),
  });
  const msg1 = (await msg1Res.json()).data;
  console.log(`   ✓ Alice sent message 1: "${msg1.content}"`);

  // Bob replies to Message 1
  const replyRes = await fetch(`${API_BASE}/conversations/${direct1.id}/messages`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({
      content: 'Hi Alice! Replying to your message.',
      replyToMessageId: msg1.id,
    }),
  });
  const replyMsg = (await replyRes.json()).data;
  console.log(`   ✓ Bob replied: "${replyMsg.content}" (replyToMessageId: ${replyMsg.replyToMessageId})`);

  // Bob reacts to Message 1 with 👍
  await fetch(`${API_BASE}/messages/${msg1.id}/reactions`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({ reaction: '👍' }),
  });
  console.log('   ✓ Bob reacted to message 1 with 👍');

  // Verify reaction appears in message query
  const checkMsgRes = await fetch(`${API_BASE}/conversations/${direct1.id}/messages`, {
    headers: aliceHeaders,
  });
  const msgList = (await checkMsgRes.json()).data.items;
  const queriedMsg1 = msgList.find((m) => m.id === msg1.id);
  if (!queriedMsg1?.reactions?.some((r) => r.reaction === '👍' && r.count === 1)) {
    throw new Error('Reaction not reflected in message query!');
  }
  console.log('   ✓ Reaction reflected in message query.\n');

  // 5. Test Message Editing & Soft Deletion with Database Row Preservation
  console.log('5. Testing Message Edit, Soft Deletion, and Local D1 Database Content Preservation...');
  // Alice edits message 1
  const editRes = await fetch(`${API_BASE}/messages/${msg1.id}`, {
    method: 'PATCH',
    headers: aliceHeaders,
    body: JSON.stringify({ content: 'Compliance statement regarding Milestone 6.' }),
  });
  const editedMsg = (await editRes.json()).data;
  console.log(`   ✓ Message edited: "${editedMsg.content}" (isEdited: ${editedMsg.isEdited})`);

  // Alice deletes message 1
  const delRes = await fetch(`${API_BASE}/messages/${msg1.id}`, {
    method: 'DELETE',
    headers: aliceHeaders,
  });
  if (delRes.status !== 200) throw new Error('Delete message failed');
  console.log('   ✓ Message soft-deleted via API.');

  // Verify in API query: Content is masked as '[This message was deleted]'
  const apiCheckDel = await fetch(`${API_BASE}/conversations/${direct1.id}/messages`, {
    headers: bobHeaders,
  });
  const deletedInApi = (await apiCheckDel.json()).data.items.find((m) => m.id === msg1.id);
  console.log(`   ✓ API query response content: "${deletedInApi.content}" (isDeleted: ${deletedInApi.isDeleted})`);
  if (deletedInApi.content !== '[This message was deleted]') {
    throw new Error('Message content was not masked by API!');
  }

  // DIRECT LOCAL D1 DATABASE QUERY: Verify original text is preserved in SQLite!
  const d1Row = db.prepare('SELECT content, deleted_at FROM messages WHERE id = ?').get(msg1.id);
  console.log(`   ✓ Direct SQLite D1 query -> content: "${d1Row.content}", deleted_at: ${d1Row.deleted_at}`);
  if (d1Row.content !== 'Compliance statement regarding Milestone 6.') {
    throw new Error('Audit violation! Original content was modified or removed from D1 SQLite!');
  }
  console.log('   ✓ Verified: Content remains preserved in local D1 for regulatory compliance!\n');

  // 6. Test Channel Creation & RBAC Enforcement
  console.log('6. Testing Channel Creation & RBAC Permissions...');
  // Bob (EMPLOYEE) attempts to create a CHANNEL -> must be rejected with 403 RBAC_FORBIDDEN
  const bobChannelRes = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({ type: 'CHANNEL', name: 'unauthorized-channel' }),
  });
  console.log(`   ✓ Bob (Employee) channel creation status: ${bobChannelRes.status}`);
  if (bobChannelRes.status !== 403) {
    throw new Error(`Expected 403 for unauthorized channel creation, got ${bobChannelRes.status}`);
  }

  // Alice (ADMIN) creates CHANNEL -> must succeed with 201 Created
  const aliceChannelRes = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ type: 'CHANNEL', name: 'engineering-general', description: 'General channel' }),
  });
  console.log(`   ✓ Alice (Admin) channel creation status: ${aliceChannelRes.status}`);
  if (aliceChannelRes.status !== 201) {
    throw new Error(`Expected 201 for admin channel creation, got ${aliceChannelRes.status}`);
  }
  const channelData = (await aliceChannelRes.json()).data;
  console.log(`   ✓ Public channel created: #${channelData.name}\n`);

  // 7. Test Group Conversations & Member Management
  console.log('7. Testing Group Conversations & Member Addition/Removal...');
  const groupRes = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ type: 'GROUP', name: 'Security Taskforce' }),
  });
  const groupData = (await groupRes.json()).data;

  // Add Bob to group
  const addMemRes = await fetch(`${API_BASE}/conversations/${groupData.id}/members`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ userId: bobUserId, role: 'MEMBER' }),
  });
  console.log(`   ✓ Alice added Bob to group: status ${addMemRes.status}`);

  // Bob leaves group
  const leaveRes = await fetch(`${API_BASE}/conversations/${groupData.id}/members/${bobUserId}`, {
    method: 'DELETE',
    headers: bobHeaders,
  });
  console.log(`   ✓ Bob left group: status ${leaveRes.status}\n`);

  // 8. Test Project Discussions & Project Membership Boundaries
  console.log('8. Testing Project Discussions & Project Member Boundaries...');
  // Alice is project manager of projId -> can create project discussion
  const projConvRes = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ type: 'PROJECT', projectId: projId, name: 'Infra Architecture Discussion' }),
  });
  console.log(`   ✓ Alice (Project Lead) created project discussion: status ${projConvRes.status}`);
  const projConvData = (await projConvRes.json()).data;

  // Bob is NOT in projectMembers for projId yet -> attempting to access or add to discussion must fail
  const bobAddProjRes = await fetch(`${API_BASE}/conversations/${projConvData.id}/members`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ userId: bobUserId, role: 'MEMBER' }),
  });
  console.log(`   ✓ Adding non-project employee to project discussion status: ${bobAddProjRes.status}`);
  if (bobAddProjRes.status !== 400) {
    throw new Error(`Expected 400 USER_NOT_PROJECT_MEMBER, got ${bobAddProjRes.status}`);
  }
  console.log('   ✓ Project membership boundary strictly enforced.\n');

  // 9. Test Notifications, Mute Suppression & Batch Read
  console.log('9. Testing Notifications, Mute Suppression, and Read-all...');
  // Bob checks initial unread count
  const notifCount1 = await (await fetch(`${API_BASE}/notifications/unread-count`, { headers: bobHeaders })).json();
  console.log(`   ✓ Bob initial unread notifications: ${notifCount1.data.unreadCount}`);

  // Alice sends message in direct chat to generate notification for Bob
  await fetch(`${API_BASE}/conversations/${direct1.id}/messages`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ content: 'Ping for notification audit.' }),
  });

  const notifCount2 = await (await fetch(`${API_BASE}/notifications/unread-count`, { headers: bobHeaders })).json();
  console.log(`   ✓ Bob unread notifications after incoming message: ${notifCount2.data.unreadCount}`);
  if (notifCount2.data.unreadCount <= notifCount1.data.unreadCount) {
    throw new Error('Notification count did not increase after incoming message!');
  }

  // Bob mutes conversation
  await fetch(`${API_BASE}/conversations/${direct1.id}/mute`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({ muted: true }),
  });
  console.log('   ✓ Bob muted conversation.');

  // Alice sends another message -> notification should be suppressed
  await fetch(`${API_BASE}/conversations/${direct1.id}/messages`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ content: 'Ping while muted.' }),
  });

  const notifCount3 = await (await fetch(`${API_BASE}/notifications/unread-count`, { headers: bobHeaders })).json();
  console.log(`   ✓ Bob unread notifications after muted message: ${notifCount3.data.unreadCount}`);
  if (notifCount3.data.unreadCount !== notifCount2.data.unreadCount) {
    throw new Error('Muted conversation did NOT suppress notification!');
  }
  console.log('   ✓ Mute suppression verified.');

  // Bob marks all notifications as read
  await fetch(`${API_BASE}/notifications/read-all`, { method: 'POST', headers: bobHeaders });
  const notifCountAfter = await (await fetch(`${API_BASE}/notifications/unread-count`, { headers: bobHeaders })).json();
  console.log(`   ✓ Bob unread notifications after read-all: ${notifCountAfter.data.unreadCount}`);
  if (notifCountAfter.data.unreadCount !== 0) {
    throw new Error('read-all did not reset unread count to 0');
  }
  console.log('   ✓ Batch read-all verified.\n');

  // 10. Test Composite Cursor Forward Polling
  console.log('10. Testing Composite Cursor Forward Polling Compatibility...');
  const histRes = await (await fetch(`${API_BASE}/conversations/${direct1.id}/messages`, { headers: aliceHeaders })).json();
  const nextCursor = histRes.data.pagination.nextCursor;
  console.log(`   ✓ Cursor received from backend: "${nextCursor}"`);

  // Decode cursor and verify { t, id } shape
  const decoded = JSON.parse(Buffer.from(nextCursor, 'base64').toString('utf8'));
  console.log('   ✓ Decoded cursor contents:', decoded);
  if (!decoded.t || !decoded.id) {
    throw new Error('Invalid cursor shape! Missing timestamp t or message id');
  }

  // Alice posts delta update message
  const deltaMsg = await (await fetch(`${API_BASE}/conversations/${direct1.id}/messages`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ content: 'Delta poll test message' }),
  })).json();

  // Forward poll using since=nextCursor
  const pollRes = await (await fetch(`${API_BASE}/conversations/${direct1.id}/messages?since=${nextCursor}`, {
    headers: aliceHeaders,
  })).json();

  console.log(`   ✓ Forward delta poll returned ${pollRes.data.items.length} new message(s)`);
  if (pollRes.data.items.length !== 1 || pollRes.data.items[0].id !== deltaMsg.data.id) {
    throw new Error('Delta polling failed to return expected message!');
  }
  console.log('   ✓ Delta polling contract 100% compatible with backend index.\n');

  console.log('=== ALL MILESTONE 6 ACCEPTANCE AUDIT TESTS PASSED SUCCESSFULLY ===\n');
}

run().catch((err) => {
  console.error('FATAL AUDIT ERROR:', err);
  process.exit(1);
});
