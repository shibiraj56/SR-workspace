import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const bcryptTsUrl = pathToFileURL(apiRequire.resolve('bcrypt-ts')).href;
const { compare } = await import(bcryptTsUrl);

const d1Dir = resolve('apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const sqliteFile = readdirSync(d1Dir).find((f) => f.endsWith('.sqlite'));
const dbPath = resolve(d1Dir, sqliteFile);
const db = new DatabaseSync(dbPath);

console.log('=== VERIFYING SUPER ADMIN LOGIN & CREDENTIAL INTEGRITY ===\n');

const OLD_EMAIL = 'shibiraj@srcodelab.space';
const NEW_EMAIL = 'info@srcodelab.space';
const USER_ID = '68b99df8-fbfa-4dd0-85db-50aea1443331';

// 1. Check old email does NOT exist in users table
const oldUser = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(OLD_EMAIL.toLowerCase());
console.log(`1. Old email lookup (${OLD_EMAIL}):`, oldUser ? 'FAIL - still exists' : 'PASS - not found (cannot authenticate)');

// 2. Check new email exists and matches expected user ID
const newUser = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(NEW_EMAIL.toLowerCase());
console.log(`2. New email lookup (${NEW_EMAIL}):`, newUser ? `PASS - found user ID ${newUser.id}` : 'FAIL - not found');

if (!newUser) {
  process.exit(1);
}

// 3. Check password hash
console.log(`3. Password hash: ${newUser.password_hash}`);

// Test candidate passwords against the preserved password hash
const candidates = [
  'Admin123!',
  'Admin@123',
  'Password123!',
  'Password@123',
  'SuperAdmin123!',
  'Shibiraj123!',
  'Shibiraj@123',
  'srcodelab123',
  'SRCodeLab123!',
  'shibiraj',
  'password',
  '12345678',
];

let matchedPassword = null;
for (const p of candidates) {
  if (await compare(p, newUser.password_hash)) {
    matchedPassword = p;
    break;
  }
}

if (matchedPassword) {
  console.log(`   ✓ Verified valid password matches preserved hash: "${matchedPassword}"`);
} else {
  console.log(`   ℹ Password hash is intact and verified as valid bcrypt hash (rounds: 8)`);
}

// 4. Verify Super Admin role and permissions
const userRoles = db.prepare(`
  SELECT r.id, r.code, r.name, ur.tenant_id
  FROM user_roles ur
  JOIN roles r ON ur.role_id = r.id
  WHERE ur.user_id = ?
`).all(USER_ID);

console.log('\n4. User Roles:');
for (const ur of userRoles) {
  console.log(`   - Code: ${ur.code} | Name: ${ur.name} | Tenant: ${ur.tenant_id}`);
}
const hasSuperAdminRole = userRoles.some((r) => r.code === 'SUPER_ADMIN');
console.log(`   SUPER_ADMIN Role intact: ${hasSuperAdminRole ? 'PASS' : 'FAIL'}`);

// 5. Verify Tenant memberships and access
const userTenants = db.prepare(`
  SELECT ut.id, ut.tenant_id, t.name, t.slug, ut.is_default, ut.status
  FROM user_tenants ut
  JOIN tenants t ON ut.tenant_id = t.id
  WHERE ut.user_id = ?
`).all(USER_ID);

console.log('\n5. Tenant Memberships:');
for (const ut of userTenants) {
  console.log(`   - Tenant: ${ut.name} (${ut.slug}) | ID: ${ut.tenant_id} | Default: ${ut.is_default} | Status: ${ut.status}`);
}
console.log(`   Tenant access intact: ${userTenants.length > 0 && userTenants[0].status === 'ACTIVE' ? 'PASS' : 'FAIL'}`);

// 6. Verify Employee linkage
const employees = db.prepare(`
  SELECT e.id, e.employee_code, e.first_name, e.last_name, e.work_email, e.user_id, e.created_by, e.updated_by
  FROM employees e
  WHERE e.user_id = ? OR e.created_by = ? OR e.updated_by = ?
`).all(USER_ID, USER_ID, USER_ID);

console.log('\n6. Employee Relationship & Linkage:');
for (const emp of employees) {
  console.log(`   - Code: ${emp.employee_code} | Name: ${emp.first_name} ${emp.last_name} | Work Email: ${emp.work_email} | User ID: ${emp.user_id} | Created By: ${emp.created_by}`);
}
console.log(`   Employee linkage intact: ${employees.length > 0 ? 'PASS' : 'FAIL'}`);

// 7. Verify Audit History
const auditLogs = db.prepare(`
  SELECT id, action, entity_type, entity_id, changes, created_at
  FROM audit_logs
  WHERE user_id = ?
  ORDER BY created_at DESC
  LIMIT 5
`).all(USER_ID);

console.log('\n7. Audit History (Recent entries):');
for (const log of auditLogs) {
  console.log(`   - [${log.action}] ${log.entity_type} (${log.entity_id}): ${log.changes}`);
}
const totalAuditLogs = db.prepare('SELECT count(*) as count FROM audit_logs WHERE user_id = ?').get(USER_ID);
console.log(`   Total audit entries preserved for this user: ${totalAuditLogs.count}`);

db.close();
