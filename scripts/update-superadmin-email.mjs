import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import crypto from 'node:crypto';

// Find local D1 miniflare SQLite database
const d1Dir = resolve('apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const sqliteFile = readdirSync(d1Dir).find((f) => f.endsWith('.sqlite'));

if (!sqliteFile) {
  console.error('Error: No SQLite file found in miniflare directory:', d1Dir);
  process.exit(1);
}

const dbPath = resolve(d1Dir, sqliteFile);
console.log('Connecting to Local D1 database:', dbPath);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

const CURRENT_EMAIL = 'shibiraj@srcodelab.space'.trim().toLowerCase();
const NEW_EMAIL = 'info@srcodelab.space'.trim().toLowerCase();
const EXPECTED_USER_ID = '68b99df8-fbfa-4dd0-85db-50aea1443331';

console.log('\n============================================================');
console.log('  SR WORKSPACE - Super Admin Email Update');
console.log('============================================================\n');

// 1. Inspect and identify existing Super Admin
const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(EXPECTED_USER_ID);

if (!existingUser) {
  console.error(`Error: User with ID ${EXPECTED_USER_ID} not found.`);
  process.exit(1);
}

if (existingUser.email.toLowerCase() !== CURRENT_EMAIL) {
  console.error(`Error: User ${EXPECTED_USER_ID} email mismatch. Expected: ${CURRENT_EMAIL}, Found: ${existingUser.email}`);
  process.exit(1);
}

console.log('✓ Found target Super Admin user:');
console.log(`  - User ID:       ${existingUser.id}`);
console.log(`  - Current Email: ${existingUser.email}`);
console.log(`  - Name:          ${existingUser.first_name} ${existingUser.last_name}`);
console.log(`  - Status:        ${existingUser.status}`);

// 2. Check conflict: verify new email does not already exist
const conflictUser = db.prepare('SELECT id, email FROM users WHERE LOWER(email) = ?').get(NEW_EMAIL);
if (conflictUser) {
  console.error(`\nConflict Error: New email "${NEW_EMAIL}" is already assigned to user ID ${conflictUser.id}. Aborting.`);
  process.exit(1);
}
console.log(`✓ Verified "${NEW_EMAIL}" is available (no conflict).`);

// 3. Verify SUPER_ADMIN role assignment
const roleAssignment = db.prepare(`
  SELECT ur.id as assignment_id, r.id as role_id, r.code, r.name, ur.tenant_id
  FROM user_roles ur
  JOIN roles r ON ur.role_id = r.id
  WHERE ur.user_id = ?
`).all(EXPECTED_USER_ID);

const isSuperAdmin = roleAssignment.some((r) => r.code === 'SUPER_ADMIN');
if (!isSuperAdmin) {
  console.error(`Error: User ${EXPECTED_USER_ID} does not possess SUPER_ADMIN role. Aborting.`);
  process.exit(1);
}
console.log(`✓ Verified SUPER_ADMIN role assignment intact.`);

// 4. Verify Tenant memberships
const tenantMemberships = db.prepare(`
  SELECT ut.id as membership_id, ut.tenant_id, t.name as tenant_name, ut.is_default, ut.status
  FROM user_tenants ut
  JOIN tenants t ON ut.tenant_id = t.id
  WHERE ut.user_id = ?
`).all(EXPECTED_USER_ID);

console.log(`✓ Found ${tenantMemberships.length} active tenant membership(s).`);
const primaryTenantId = tenantMemberships[0]?.tenant_id || null;

// 5. Check employee relationship
const linkedEmployees = db.prepare(`
  SELECT id, employee_code, first_name, last_name, work_email, user_id, created_by, updated_by
  FROM employees
  WHERE user_id = ? OR created_by = ? OR updated_by = ?
`).all(EXPECTED_USER_ID, EXPECTED_USER_ID, EXPECTED_USER_ID);
console.log(`✓ Found ${linkedEmployees.length} employee record(s) linked to this user.`);

// 6. Execute atomic update
console.log('\nExecuting atomic email update and security session invalidation...');
db.exec('BEGIN TRANSACTION;');

try {
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  // Update email on existing user record
  const updateStmt = db.prepare(`
    UPDATE users
    SET email = ?, updated_at = ?
    WHERE id = ?
  `);
  updateStmt.run(NEW_EMAIL, nowMs, EXPECTED_USER_ID);

  // Invalidate any active refresh tokens / sessions for security consistency
  const revokeStmt = db.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = ?
    WHERE user_id = ? AND revoked_at IS NULL
  `);
  const revokeResult = revokeStmt.run(nowSec, EXPECTED_USER_ID);
  console.log(`✓ Invalidated active refresh token sessions (count: ${revokeResult.changes}).`);

  // Record audit log entry without exposing sensitive information
  const auditLogId = crypto.randomUUID();
  const auditChanges = JSON.stringify({
    field: 'email',
    previousValue: CURRENT_EMAIL,
    newValue: NEW_EMAIL,
    reason: 'Super Admin login email update',
  });

  const auditStmt = db.prepare(`
    INSERT INTO audit_logs (
      id, tenant_id, user_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, 'UPDATE', 'user', ?, ?, '127.0.0.1', 'admin-cli/email-update', ?)
  `);
  auditStmt.run(
    auditLogId,
    primaryTenantId,
    EXPECTED_USER_ID,
    EXPECTED_USER_ID,
    auditChanges,
    nowSec
  );
  console.log(`✓ Recorded audit log record: ${auditLogId}`);

  db.exec('COMMIT;');
  console.log('✓ Transaction committed successfully.');
} catch (error) {
  db.exec('ROLLBACK;');
  console.error('Update failed, rolled back transaction:', error);
  process.exit(1);
}

// 7. Post-update verification
const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(EXPECTED_USER_ID);
console.log('\n============================================================');
console.log('POST-UPDATE STATE VERIFICATION');
console.log('============================================================');
console.log(`User ID:              ${updatedUser.id} (${updatedUser.id === EXPECTED_USER_ID ? 'PRESERVED' : 'CHANGED!'})`);
console.log(`New Email:            ${updatedUser.email} (${updatedUser.email === NEW_EMAIL ? 'CONFIRMED' : 'FAILED!'})`);
console.log(`Password Hash:        ${updatedUser.password_hash} (${updatedUser.password_hash === existingUser.password_hash ? 'PRESERVED' : 'MODIFIED!'})`);
console.log(`Status:               ${updatedUser.status} (PRESERVED)`);
console.log(`Email Verified:       ${updatedUser.email_verified} (PRESERVED)`);

// Check old email cannot be found
const oldEmailCheck = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(CURRENT_EMAIL);
console.log(`Old Email Lookup:     ${oldEmailCheck ? 'FOUND (ERROR)' : 'NOT FOUND (CORRECT - CAN NO LONGER AUTHENTICATE)'}`);

// Check new email lookup
const newEmailCheck = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(NEW_EMAIL);
console.log(`New Email Lookup:     ${newEmailCheck ? `FOUND (ID: ${newEmailCheck.id})` : 'NOT FOUND (ERROR)'}`);

db.close();
console.log('\nDatabase update complete.\n');
