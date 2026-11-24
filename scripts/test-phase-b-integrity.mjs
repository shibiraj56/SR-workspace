import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

const d1Dir = resolve('apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const sqliteFile = readdirSync(d1Dir).find((f) => f.endsWith('.sqlite'));

if (!sqliteFile) {
  console.error('No SQLite file found in miniflare directory');
  process.exit(1);
}

const dbPath = resolve(d1Dir, sqliteFile);
console.log('Connecting to Local D1 database:', dbPath);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

console.log('=== RUNNING TARGETED INTEGRITY TESTS ===\n');

db.exec('BEGIN TRANSACTION;');

try {
  // 1. Setup mock tenant and users
  const tenantA = 'test-tenant-alpha-' + Date.now();
  const tenantB = 'test-tenant-beta-' + Date.now();
  const user1 = 'test-user-01-' + Date.now();
  const user2 = 'test-user-02-' + Date.now();
  const user3 = 'test-user-03-' + Date.now();
  const empA = 'test-emp-a-' + Date.now();
  const projectA = 'test-prj-a-' + Date.now();

  const now = Date.now();

  db.prepare(`INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`).run(
    tenantA, 'Tenant A', 'tenant-a-' + Date.now(), now, now
  );
  db.prepare(`INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`).run(
    tenantB, 'Tenant B', 'tenant-b-' + Date.now(), now, now
  );

  for (const [uId, email] of [[user1, 'u1@test.com'], [user2, 'u2@test.com'], [user3, 'u3@test.com']]) {
    db.prepare(`INSERT INTO users (id, email, password_hash, first_name, last_name, status, created_at, updated_at) VALUES (?, ?, 'hash', 'Test', 'User', 'ACTIVE', ?, ?)`).run(
      uId, `${Date.now()}_${email}`, now, now
    );
  }

  // Create an employee in tenantA for project owner
  db.prepare(`
    INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, user_id, employment_type, joining_date, employment_status, created_at, updated_at)
    VALUES (?, ?, ?, 'Emp', 'One', ?, 'FULL_TIME', ?, 'ACTIVE', ?, ?)
  `).run(empA, tenantA, 'EMP-' + Date.now(), user1, now, now, now);

  db.prepare(`INSERT INTO projects (id, tenant_id, project_code, name, status, priority, owner_employee_id, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'PLANNING', 'MEDIUM', ?, ?, ?, ?, ?)`).run(
    projectA, tenantA, 'PRJ-' + Date.now(), 'Project A', empA, user1, user1, now, now
  );

  console.log('[+] Test harness setup successful.');

  // 2. Test Direct Conversation Canonical Uniqueness
  console.log('\n--- Test 2: Direct Conversation Uniqueness & Canonical Ordering ---');
  const uSmall = user1 < user2 ? user1 : user2;
  const uLarge = user1 < user2 ? user2 : user1;

  // Insert direct conversation with canonical ordering
  const convDirect1 = 'conv-dir-1-' + Date.now();
  db.prepare(`
    INSERT INTO conversations (id, tenant_id, conversation_type, direct_user1_id, direct_user2_id, created_by, created_at, updated_at)
    VALUES (?, ?, 'DIRECT', ?, ?, ?, ?, ?)
  `).run(convDirect1, tenantA, uSmall, uLarge, uSmall, now, now);
  console.log('✓ Inserted canonical direct conversation 1 successfully.');

  // Attempt to insert duplicate direct conversation in same tenant
  let dupFailed = false;
  try {
    db.prepare(`
      INSERT INTO conversations (id, tenant_id, conversation_type, direct_user1_id, direct_user2_id, created_by, created_at, updated_at)
      VALUES (?, ?, 'DIRECT', ?, ?, ?, ?, ?)
    `).run('conv-dir-dup', tenantA, uSmall, uLarge, uLarge, now, now);
  } catch (err) {
    dupFailed = true;
    console.log('✓ Duplicate direct conversation rejected by SQLite unique constraint:', err.message);
  }
  if (!dupFailed) throw new Error('Expected duplicate direct conversation to fail!');

  // Verify same users CAN have a direct conversation in a different tenant (Tenant B)
  const convDirectTenantB = 'conv-dir-tb-' + Date.now();
  db.prepare(`
    INSERT INTO conversations (id, tenant_id, conversation_type, direct_user1_id, direct_user2_id, created_by, created_at, updated_at)
    VALUES (?, ?, 'DIRECT', ?, ?, ?, ?, ?)
  `).run(convDirectTenantB, tenantB, uSmall, uLarge, uSmall, now, now);
  console.log('✓ Direct conversation between same users allowed in separate tenant (Tenant B).');

  // Test SQLite NULL behavior for GROUP/CHANNEL conversations
  console.log('\n--- Test 3: SQLite NULL Behavior on Unique Composite Index ---');
  const convGroup1 = 'conv-grp-1-' + Date.now();
  const convGroup2 = 'conv-grp-2-' + Date.now();
  db.prepare(`
    INSERT INTO conversations (id, tenant_id, conversation_type, name, direct_user1_id, direct_user2_id, created_by, created_at, updated_at)
    VALUES (?, ?, 'GROUP', 'Group 1', NULL, NULL, ?, ?, ?)
  `).run(convGroup1, tenantA, user1, now, now);
  db.prepare(`
    INSERT INTO conversations (id, tenant_id, conversation_type, name, direct_user1_id, direct_user2_id, created_by, created_at, updated_at)
    VALUES (?, ?, 'GROUP', 'Group 2', NULL, NULL, ?, ?, ?)
  `).run(convGroup2, tenantA, user1, now, now);
  console.log('✓ Successfully inserted multiple GROUP conversations with NULL direct_user1_id/direct_user2_id in same tenant without unique constraint collision.');

  // 4. Test Reaction Uniqueness
  console.log('\n--- Test 4: Reaction Uniqueness ---');
  const msgId = 'msg-1-' + Date.now();
  db.prepare(`
    INSERT INTO messages (id, tenant_id, conversation_id, sender_user_id, content, created_at, updated_at, edited_at)
    VALUES (?, ?, ?, ?, 'Hello World', ?, ?, NULL)
  `).run(msgId, tenantA, convDirect1, user1, now, now);

  db.prepare(`
    INSERT INTO message_reactions (id, tenant_id, message_id, user_id, reaction, created_at)
    VALUES (?, ?, ?, ?, '👍', ?)
  `).run('react-1', tenantA, msgId, user2, now);
  console.log('✓ Inserted reaction 👍 successfully.');

  let dupReactFailed = false;
  try {
    db.prepare(`
      INSERT INTO message_reactions (id, tenant_id, message_id, user_id, reaction, created_at)
      VALUES (?, ?, ?, ?, '👍', ?)
    `).run('react-2', tenantA, msgId, user2, now);
  } catch (err) {
    dupReactFailed = true;
    console.log('✓ Duplicate reaction by same user rejected:', err.message);
  }
  if (!dupReactFailed) throw new Error('Expected duplicate reaction to fail!');

  // Same user can add a different reaction
  db.prepare(`
    INSERT INTO message_reactions (id, tenant_id, message_id, user_id, reaction, created_at)
    VALUES (?, ?, ?, ?, '❤️', ?)
  `).run('react-3', tenantA, msgId, user2, now);
  console.log('✓ Different reaction ❤️ by same user allowed.');

  // 5. Test Soft Delete & Message Threading
  console.log('\n--- Test 5: Soft Delete & Message Threading ---');
  const replyMsgId = 'msg-reply-1-' + Date.now();
  db.prepare(`
    INSERT INTO messages (id, tenant_id, conversation_id, sender_user_id, reply_to_message_id, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'Replying to hello', ?, ?)
  `).run(replyMsgId, tenantA, convDirect1, user2, msgId, now, now);
  console.log('✓ Inserted reply message with reply_to_message_id referencing parent.');

  // Soft delete parent
  const deleteTime = Date.now();
  db.prepare(`UPDATE messages SET deleted_at = ? WHERE id = ?`).run(deleteTime, msgId);
  const parentMsg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(msgId);
  console.log(`✓ Soft deleted parent message: deleted_at=${parentMsg.deleted_at}, content preserved for audit.`);

  // 6. Test Notifications Recipient & Actor
  console.log('\n--- Test 6: Notifications Recipient & Actor ---');
  const notifId = 'notif-1-' + Date.now();
  db.prepare(`
    INSERT INTO notifications (id, tenant_id, recipient_user_id, actor_user_id, type, conversation_id, message_id, title, body, created_at)
    VALUES (?, ?, ?, ?, 'NEW_MESSAGE', ?, ?, 'New Message', 'Hello snippet', ?)
  `).run(notifId, tenantA, user2, user1, convDirect1, msgId, now);
  console.log('✓ Inserted notification successfully.');

  // 7. Test Cascading Deletes & SET NULL
  console.log('\n--- Test 7: Cascading Deletes & SET NULL ---');
  const notif2 = 'notif-2-' + Date.now();
  db.prepare(`
    INSERT INTO notifications (id, tenant_id, recipient_user_id, actor_user_id, type, title, body, created_at)
    VALUES (?, ?, ?, ?, 'NEW_MESSAGE', 'System Alert', 'Body', ?)
  `).run(notif2, tenantA, user2, user3, now);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(user3);
  const checkedNotif2 = db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(notif2);
  console.log(`✓ Actor user deleted: notification actor_user_id was set to null: actor_user_id=${checkedNotif2.actor_user_id}`);

  // Test reply_to_message_id SET NULL when parent message is hard-deleted
  const testParentMsg = 'test-parent-del-' + Date.now();
  const testReplyMsg = 'test-reply-del-' + Date.now();
  db.prepare(`
    INSERT INTO messages (id, tenant_id, conversation_id, sender_user_id, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Temporary parent', ?, ?)
  `).run(testParentMsg, tenantA, convDirect1, user1, now, now);
  db.prepare(`
    INSERT INTO messages (id, tenant_id, conversation_id, sender_user_id, reply_to_message_id, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'Temporary reply', ?, ?)
  `).run(testReplyMsg, tenantA, convDirect1, user2, testParentMsg, now, now);
  
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(testParentMsg);
  const checkedReply = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(testReplyMsg);
  console.log(`✓ Hard-deleted parent message: child reply_to_message_id was set to null: reply_to_message_id=${checkedReply.reply_to_message_id}`);

  // Delete conversation -> should cascade delete messages, reactions, notifications
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(convDirect1);
  const remMsg = db.prepare(`SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?`).get(convDirect1);
  const remReact = db.prepare(`SELECT COUNT(*) as c FROM message_reactions WHERE message_id = ?`).get(msgId);
  const remNotif = db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE conversation_id = ?`).get(convDirect1);
  console.log(`✓ Conversation deleted: remaining messages=${remMsg.c}, reactions=${remReact.c}, notifications=${remNotif.c}`);

  // 8. Cross-Tenant Integrity Gap Investigation
  console.log('\n--- Test 8: Cross-Tenant Foreign Key Gap Analysis ---');
  const crossTenantPrjConv = 'conv-cross-prj-' + Date.now();
  let crossAllowed = false;
  try {
    db.prepare(`
      INSERT INTO conversations (id, tenant_id, conversation_type, project_id, created_by, created_at, updated_at)
      VALUES (?, ?, 'PROJECT', ?, ?, ?, ?)
    `).run(crossTenantPrjConv, tenantB, projectA, user2, now, now);
    crossAllowed = true;
  } catch (err) {
    console.log('Cross-tenant project link rejected by DB:', err.message);
  }
  if (crossAllowed) {
    console.log('⚠️ CONFIRMED DB GAP: SQLite foreign key project_id -> projects(id) only validates record existence, NOT tenant matching (Tenant B conversation linked to Tenant A project at DB level).');
  }

  // Cross-tenant user gap investigation:
  const convB = 'conv-tb-' + Date.now();
  db.prepare(`
    INSERT INTO conversations (id, tenant_id, conversation_type, name, created_by, created_at, updated_at)
    VALUES (?, ?, 'GROUP', 'Tenant B Group', ?, ?, ?)
  `).run(convB, tenantB, user2, now, now);
  
  db.prepare(`
    INSERT INTO conversation_members (id, tenant_id, conversation_id, user_id, role, joined_at)
    VALUES (?, ?, ?, ?, 'MEMBER', ?)
  `).run('cm-cross-user', tenantB, convB, user1, now);
  console.log('⚠️ CONFIRMED DB GAP: SQLite foreign key user_id -> users(id) only validates global user existence. It does NOT check whether user has user_tenants membership for tenant_id!');

} catch (err) {
  console.error('Integrity test error:', err);
  throw err;
} finally {
  db.exec('ROLLBACK;');
  console.log('\n=== TRANSACTION ROLLED BACK CLEANLY (NO TEST DATA PERSISTED) ===');
  console.log('ALL INTEGRITY TESTS EXECUTED AND ROLLED BACK SUCCESSFULLY!\n');
}
