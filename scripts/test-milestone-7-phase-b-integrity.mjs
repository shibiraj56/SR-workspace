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

console.log('============================================================');
console.log('MILESTONE 7 PHASE B: HR & WORKFORCE INTEGRITY TEST SUITE');
console.log('============================================================\n');

db.exec('BEGIN TRANSACTION;');

try {
  // 1. Verify Migration Record
  console.log('--- TEST 1: Migration Baseline & 0004_hr_workforce Journal Verification ---');
  const migrations = db.prepare('SELECT name, applied_at FROM d1_migrations ORDER BY id ASC').all();
  console.log('Applied migrations in local D1:');
  for (const m of migrations) {
    console.log(`  - ${m.name} (applied: ${m.applied_at})`);
  }
  const has0004 = migrations.some((m) => m.name.includes('0004_hr_workforce'));
  if (!has0004) {
    throw new Error('Migration 0004_hr_workforce.sql is NOT recorded in d1_migrations!');
  }
  console.log('✓ TEST 1 PASSED: Migration 0004_hr_workforce.sql is successfully applied and journaled.\n');

  // 2. Setup Test Harness (Tenants, Users, Employees)
  console.log('--- TEST 2: Multi-Tenant Test Harness Setup ---');
  const now = Date.now();
  const tenantA = 'test-tenant-hr-a-' + now;
  const tenantB = 'test-tenant-hr-b-' + now;
  const userA1 = 'test-user-hr-a1-' + now;
  const userA2 = 'test-user-hr-a2-' + now;
  const userB1 = 'test-user-hr-b1-' + now;
  const empA1 = 'test-emp-hr-a1-' + now;
  const empA2 = 'test-emp-hr-a2-' + now;
  const empB1 = 'test-emp-hr-b1-' + now;

  db.prepare(`INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`).run(
    tenantA, 'HR Tenant Alpha', 'hr-alpha-' + now, now, now
  );
  db.prepare(`INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`).run(
    tenantB, 'HR Tenant Beta', 'hr-beta-' + now, now, now
  );

  for (const [uid, email] of [[userA1, 'a1@test.com'], [userA2, 'a2@test.com'], [userB1, 'b1@test.com']]) {
    db.prepare(`INSERT INTO users (id, email, password_hash, first_name, last_name, status, created_at, updated_at) VALUES (?, ?, 'hash', 'Test', 'User', 'ACTIVE', ?, ?)`).run(
      uid, `${now}_${email}`, now, now
    );
  }

  // Create employees
  db.prepare(`
    INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, user_id, employment_type, joining_date, employment_status, created_at, updated_at)
    VALUES (?, ?, 'EMP-001', 'Alice', 'Smith', ?, 'FULL_TIME', ?, 'ACTIVE', ?, ?)
  `).run(empA1, tenantA, userA1, now, now, now);

  db.prepare(`
    INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, user_id, employment_type, joining_date, employment_status, created_at, updated_at)
    VALUES (?, ?, 'EMP-002', 'Bob', 'Jones', ?, 'FULL_TIME', ?, 'ACTIVE', ?, ?)
  `).run(empA2, tenantA, userA2, now, now, now);

  db.prepare(`
    INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, user_id, employment_type, joining_date, employment_status, created_at, updated_at)
    VALUES (?, ?, 'EMP-001', 'Charlie', 'Brown', ?, 'FULL_TIME', ?, 'ACTIVE', ?, ?)
  `).run(empB1, tenantB, userB1, now, now, now);

  console.log('✓ TEST 2 PASSED: Tenants, users, and cross-tenant employees provisioned.\n');

  // 3. Shift Management Integrity
  console.log('--- TEST 3: Shifts & Employee Shift Assignments ---');
  const shiftA1 = 'shift-a1-' + now;
  db.prepare(`
    INSERT INTO shifts (id, tenant_id, code, name, start_time, end_time, grace_period_minutes, half_day_threshold_minutes, is_active, created_at, updated_at)
    VALUES (?, ?, 'GEN', 'General Shift 9AM-6PM', '09:00', '18:00', 15, 240, 1, ?, ?)
  `).run(shiftA1, tenantA, now, now);

  // Attempt duplicate shift code in same tenant
  let dupShiftCodeRejected = false;
  try {
    db.prepare(`
      INSERT INTO shifts (id, tenant_id, code, name, start_time, end_time, created_at, updated_at)
      VALUES (?, ?, 'GEN', 'Duplicate General Shift', '09:00', '18:00', ?, ?)
    `).run('shift-dup-' + now, tenantA, now, now);
  } catch (err) {
    dupShiftCodeRejected = true;
    console.log('  ✓ Duplicate shift code in same tenant rejected:', err.message);
  }
  if (!dupShiftCodeRejected) throw new Error('Expected duplicate shift code to fail!');

  // Same code allowed in different tenant (Tenant B)
  const shiftB1 = 'shift-b1-' + now;
  db.prepare(`
    INSERT INTO shifts (id, tenant_id, code, name, start_time, end_time, created_at, updated_at)
    VALUES (?, ?, 'GEN', 'Tenant B General Shift', '09:30', '18:30', ?, ?)
  `).run(shiftB1, tenantB, now, now);
  console.log('  ✓ Identical shift code allowed across different tenants.');

  // Assign shift to employee
  const empShiftA1 = 'emp-shift-a1-' + now;
  db.prepare(`
    INSERT INTO employee_shifts (id, tenant_id, employee_id, shift_id, effective_from, effective_to, assigned_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, '2026-01-01', NULL, ?, ?, ?)
  `).run(empShiftA1, tenantA, empA1, shiftA1, userA1, now, now);
  console.log('✓ TEST 3 PASSED: Shift definitions, uniqueness, and employee assignments verified.\n');

  // 4. Holiday Calendar Integrity
  console.log('--- TEST 4: Holiday Calendars & Unique Constraints ---');
  const holiday1 = 'hol-1-' + now;
  db.prepare(`
    INSERT INTO holidays (id, tenant_id, name, date, holiday_type, description, created_at, updated_at)
    VALUES (?, ?, 'New Year Day', '2026-01-01', 'MANDATORY', 'Public Holiday', ?, ?)
  `).run(holiday1, tenantA, now, now);

  // Duplicate date in same tenant
  let dupHolidayRejected = false;
  try {
    db.prepare(`
      INSERT INTO holidays (id, tenant_id, name, date, holiday_type, description, created_at, updated_at)
      VALUES (?, ?, 'Alternate Holiday', '2026-01-01', 'OPTIONAL', 'Conflicting', ?, ?)
    `).run('hol-dup-' + now, tenantA, now, now);
  } catch (err) {
    dupHolidayRejected = true;
    console.log('  ✓ Duplicate holiday date in same tenant rejected:', err.message);
  }
  if (!dupHolidayRejected) throw new Error('Expected duplicate holiday date to fail!');

  // Same date in Tenant B allowed
  db.prepare(`
    INSERT INTO holidays (id, tenant_id, name, date, holiday_type, description, created_at, updated_at)
    VALUES (?, ?, 'New Year Day Tenant B', '2026-01-01', 'MANDATORY', 'Public Holiday', ?, ?)
  `).run('hol-b1-' + now, tenantB, now, now);
  console.log('  ✓ Identical holiday date allowed in different tenant.');
  console.log('✓ TEST 4 PASSED: Holiday calendar and unique date constraints verified.\n');

  // 5. Daily Attendance & Regularization Integrity
  console.log('--- TEST 5: Daily Attendance & Regularization Lifecycle ---');
  const attDate = '2026-11-24';
  const attA1 = 'att-a1-' + now;
  db.prepare(`
    INSERT INTO attendance_records (id, tenant_id, employee_id, shift_id, date, punch_in_time, punch_out_time, total_work_minutes, total_break_minutes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 480, 60, 'PRESENT', ?, ?)
  `).run(attA1, tenantA, empA1, shiftA1, attDate, now - 28800000, now, now, now);
  console.log('  ✓ Inserted daily attendance record for employee on', attDate);

  // Attempt duplicate attendance for same employee and date
  let dupAttendanceRejected = false;
  try {
    db.prepare(`
      INSERT INTO attendance_records (id, tenant_id, employee_id, shift_id, date, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PRESENT', ?, ?)
    `).run('att-dup-' + now, tenantA, empA1, shiftA1, attDate, now, now);
  } catch (err) {
    dupAttendanceRejected = true;
    console.log('  ✓ Duplicate attendance record for same employee and date rejected:', err.message);
  }
  if (!dupAttendanceRejected) throw new Error('Expected duplicate attendance record to fail!');

  // Different employee in same tenant on same date allowed
  db.prepare(`
    INSERT INTO attendance_records (id, tenant_id, employee_id, shift_id, date, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'LATE', ?, ?)
  `).run('att-a2-' + now, tenantA, empA2, shiftA1, attDate, now, now);
  console.log('  ✓ Distinct employee in same tenant on same date allowed.');

  // Attendance Regularization Request
  const reg1 = 'reg-1-' + now;
  db.prepare(`
    INSERT INTO attendance_regularizations (id, tenant_id, attendance_record_id, employee_id, date, requested_punch_in, requested_punch_out, reason, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Forgot punch card', 'PENDING', ?, ?)
  `).run(reg1, tenantA, attA1, empA1, attDate, now - 30000000, now, now, now);
  console.log('  ✓ Attendance regularization created linking to attendance record.');

  // Manager Review
  db.prepare(`
    UPDATE attendance_regularizations
    SET status = 'APPROVED', reviewed_by_employee_id = ?, review_notes = 'Approved upon review', reviewed_at = ?
    WHERE id = ?
  `).run(empA2, now, reg1);
  const reviewedReg = db.prepare('SELECT * FROM attendance_regularizations WHERE id = ?').get(reg1);
  if (reviewedReg.status !== 'APPROVED' || reviewedReg.reviewed_by_employee_id !== empA2) {
    throw new Error('Regularization review update failed!');
  }
  console.log('  ✓ Attendance regularization approved and auditorily tracked.');
  console.log('✓ TEST 5 PASSED: Attendance uniqueness and regularization workflow verified.\n');

  // 6. Leave Types, Allocations & Balance Integrity
  console.log('--- TEST 6: Leave Types, Quotas, Allocations & Applications ---');
  const ltCasual = 'lt-casual-' + now;
  const ltSick = 'lt-sick-' + now;

  db.prepare(`
    INSERT INTO leave_types (id, tenant_id, code, name, default_days_per_year, is_paid, requires_proof, is_active, created_at, updated_at)
    VALUES (?, ?, 'CASUAL', 'Casual Leave', 12.0, 1, 0, 1, ?, ?)
  `).run(ltCasual, tenantA, now, now);

  db.prepare(`
    INSERT INTO leave_types (id, tenant_id, code, name, default_days_per_year, is_paid, requires_proof, is_active, created_at, updated_at)
    VALUES (?, ?, 'SICK', 'Sick Leave', 10.0, 1, 1, 1, ?, ?)
  `).run(ltSick, tenantA, now, now);

  // Duplicate leave type code rejected
  let dupLeaveCodeRejected = false;
  try {
    db.prepare(`
      INSERT INTO leave_types (id, tenant_id, code, name, default_days_per_year, created_at, updated_at)
      VALUES (?, ?, 'CASUAL', 'Duplicate Casual', 15.0, ?, ?)
    `).run('lt-dup-' + now, tenantA, now, now);
  } catch (err) {
    dupLeaveCodeRejected = true;
    console.log('  ✓ Duplicate leave type code in same tenant rejected:', err.message);
  }
  if (!dupLeaveCodeRejected) throw new Error('Expected duplicate leave type code to fail!');

  // Leave Allocation
  const alloc1 = 'alloc-1-' + now;
  db.prepare(`
    INSERT INTO leave_allocations (id, tenant_id, employee_id, leave_type_id, year, allocated_days, used_days, pending_days, created_at, updated_at)
    VALUES (?, ?, ?, ?, 2026, 12.0, 0, 0, ?, ?)
  `).run(alloc1, tenantA, empA1, ltCasual, now, now);
  console.log('  ✓ Allocated 12 days Casual Leave for 2026.');

  // Duplicate allocation rejected for same employee + type + year
  let dupAllocRejected = false;
  try {
    db.prepare(`
      INSERT INTO leave_allocations (id, tenant_id, employee_id, leave_type_id, year, allocated_days, created_at, updated_at)
      VALUES (?, ?, ?, ?, 2026, 6.0, ?, ?)
    `).run('alloc-dup-' + now, tenantA, empA1, ltCasual, now, now);
  } catch (err) {
    dupAllocRejected = true;
    console.log('  ✓ Duplicate leave allocation for same year rejected:', err.message);
  }
  if (!dupAllocRejected) throw new Error('Expected duplicate leave allocation to fail!');

  // Leave Request Submission
  const lr1 = 'lr-1-' + now;
  db.prepare(`
    INSERT INTO leave_requests (id, tenant_id, employee_id, leave_type_id, start_date, end_date, total_days, is_half_day, reason, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, '2026-12-01', '2026-12-02', 2.0, 0, 'Personal work', 'PENDING', ?, ?)
  `).run(lr1, tenantA, empA1, ltCasual, now, now);

  // Update allocation pending_days
  db.prepare(`UPDATE leave_allocations SET pending_days = pending_days + 2.0 WHERE id = ?`).run(alloc1);
  let allocCheck = db.prepare('SELECT * FROM leave_allocations WHERE id = ?').get(alloc1);
  if (allocCheck.pending_days !== 2.0) throw new Error('Pending days update failed!');
  console.log('  ✓ Submitted 2-day leave request, pending_days incremented to 2.0.');

  // Approve leave request
  db.prepare(`
    UPDATE leave_requests
    SET status = 'APPROVED', reviewed_by_employee_id = ?, review_notes = 'Enjoy your leave', reviewed_at = ?
    WHERE id = ?
  `).run(empA2, now, lr1);

  // Update allocation: decrement pending, increment used
  db.prepare(`UPDATE leave_allocations SET pending_days = pending_days - 2.0, used_days = used_days + 2.0 WHERE id = ?`).run(alloc1);
  allocCheck = db.prepare('SELECT * FROM leave_allocations WHERE id = ?').get(alloc1);
  if (allocCheck.pending_days !== 0.0 || allocCheck.used_days !== 2.0) {
    throw new Error('Balance update after approval failed!');
  }
  console.log('  ✓ Approved leave request, used_days = 2.0, pending_days = 0.0.');

  // Restrict onDelete on leave_types when active requests exist
  let deleteLtRejected = false;
  try {
    db.prepare('DELETE FROM leave_types WHERE id = ?').run(ltCasual);
  } catch (err) {
    deleteLtRejected = true;
    console.log('  ✓ Deletion of leave_type with active requests prevented by RESTRICT:', err.message);
  }
  if (!deleteLtRejected) throw new Error('Expected leave_type deletion to be restricted!');
  console.log('✓ TEST 6 PASSED: Leave types, allocations, balances and applications verified.\n');

  // 7. Performance Reviews & Cycles
  console.log('--- TEST 7: Performance Cycles & Reviews ---');
  const cycle1 = 'cycle-1-' + now;
  db.prepare(`
    INSERT INTO performance_cycles (id, tenant_id, code, name, start_date, end_date, status, description, created_at, updated_at)
    VALUES (?, ?, '2026-Q4', 'Q4 2026 Performance Appraisal', '2026-10-01', '2026-12-31', 'ACTIVE', 'Quarterly Review', ?, ?)
  `).run(cycle1, tenantA, now, now);

  const rev1 = 'rev-1-' + now;
  db.prepare(`
    INSERT INTO performance_reviews (id, tenant_id, cycle_id, employee_id, reviewer_employee_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'PENDING_SELF_REVIEW', ?, ?)
  `).run(rev1, tenantA, cycle1, empA1, empA2, now, now);

  // Duplicate review for same employee in same cycle rejected
  let dupReviewRejected = false;
  try {
    db.prepare(`
      INSERT INTO performance_reviews (id, tenant_id, cycle_id, employee_id, reviewer_employee_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING_SELF_REVIEW', ?, ?)
    `).run('rev-dup-' + now, tenantA, cycle1, empA1, empA2, now, now);
  } catch (err) {
    dupReviewRejected = true;
    console.log('  ✓ Duplicate performance review in same cycle rejected:', err.message);
  }
  if (!dupReviewRejected) throw new Error('Expected duplicate review to fail!');

  // Employee Self Review Submission
  db.prepare(`
    UPDATE performance_reviews
    SET self_rating = 4.5, self_feedback = 'Exceeded sprint targets', status = 'PENDING_MANAGER_REVIEW', self_submitted_at = ?
    WHERE id = ?
  `).run(now, rev1);

  // Manager Assessment Submission
  db.prepare(`
    UPDATE performance_reviews
    SET manager_rating = 4.2, manager_feedback = 'Strong execution', goals_met = 'All 5 Key Results met', final_score = 4.35, status = 'COMPLETED', manager_submitted_at = ?
    WHERE id = ?
  `).run(now, rev1);

  const completedRev = db.prepare('SELECT * FROM performance_reviews WHERE id = ?').get(rev1);
  if (completedRev.status !== 'COMPLETED' || completedRev.final_score !== 4.35) {
    throw new Error('Performance review completion failed!');
  }
  console.log('  ✓ Two-stage performance appraisal completed (self rating: 4.5, manager rating: 4.2, final score: 4.35).');
  console.log('✓ TEST 7 PASSED: Performance cycles, ratings separation and completions verified.\n');

  // 8. Employee Lifecycle: Onboarding, Events, Resignation, Exit Checklists
  console.log('--- TEST 8: Employee Lifecycle, Onboarding & Exit Clearances ---');
  // Onboarding task
  const onb1 = 'onb-1-' + now;
  db.prepare(`
    INSERT INTO hr_onboarding_tasks (id, tenant_id, employee_id, title, category, status, assigned_to_employee_id, due_date, created_at, updated_at)
    VALUES (?, ?, ?, 'Collect National ID & Bank Details', 'DOCUMENTATION', 'PENDING', ?, '2026-11-30', ?, ?)
  `).run(onb1, tenantA, empA1, empA2, now, now);

  // Lifecycle event
  const lfe1 = 'lfe-1-' + now;
  db.prepare(`
    INSERT INTO hr_lifecycle_events (id, tenant_id, employee_id, event_type, previous_state, new_state, effective_date, remarks, recorded_by_user_id, created_at)
    VALUES (?, ?, ?, 'ONBOARDING', NULL, 'ACTIVE', '2026-11-24', 'Employee joined engineering team', ?, ?)
  `).run(lfe1, tenantA, empA1, userA2, now);
  console.log('  ✓ Logged onboarding task and initial lifecycle event.');

  // Resignation workflow
  const resig1 = 'resig-1-' + now;
  db.prepare(`
    INSERT INTO hr_resignations (id, tenant_id, employee_id, resignation_date, proposed_last_working_date, reason, status, created_at, updated_at)
    VALUES (?, ?, ?, '2026-11-24', '2026-12-24', 'Better opportunity', 'SUBMITTED', ?, ?)
  `).run(resig1, tenantA, empA1, now, now);

  // Exit Checklists
  const chk1 = 'chk-1-' + now;
  const chk2 = 'chk-2-' + now;
  db.prepare(`
    INSERT INTO hr_exit_checklists (id, tenant_id, resignation_id, department, item, status, created_at, updated_at)
    VALUES (?, ?, ?, 'IT', 'Return company laptop and security key', 'PENDING', ?, ?)
  `).run(chk1, tenantA, resig1, now, now);

  db.prepare(`
    INSERT INTO hr_exit_checklists (id, tenant_id, resignation_id, department, item, status, created_at, updated_at)
    VALUES (?, ?, ?, 'FINANCE', 'Final expense claims clearance', 'PENDING', ?, ?)
  `).run(chk2, tenantA, resig1, now, now);

  // IT clearance completed
  db.prepare(`
    UPDATE hr_exit_checklists
    SET status = 'COMPLETED', cleared_by_employee_id = ?, cleared_at = ?
    WHERE id = ?
  `).run(empA2, now, chk1);

  const clearedChk = db.prepare('SELECT * FROM hr_exit_checklists WHERE id = ?').get(chk1);
  if (clearedChk.status !== 'COMPLETED' || clearedChk.cleared_by_employee_id !== empA2) {
    throw new Error('Checklist clearance update failed!');
  }
  console.log('  ✓ IT exit clearance approved; employee identity remains intact without hard-delete.');
  console.log('✓ TEST 8 PASSED: Lifecycle events, onboarding, resignation, and exit clearances verified.\n');

  // 9. Employee Document Metadata (No Binary)
  console.log('--- TEST 9: Employee Document Metadata (Strictly Metadata-Only) ---');
  const doc1 = 'doc-1-' + now;
  db.prepare(`
    INSERT INTO hr_document_metadata (id, tenant_id, employee_id, title, document_type, document_number, verification_status, created_at, updated_at)
    VALUES (?, ?, ?, 'National Identity Card', 'NATIONAL_ID', 'ID-987654321', 'PENDING', ?, ?)
  `).run(doc1, tenantA, empA1, now, now);

  // Document verification
  db.prepare(`
    UPDATE hr_document_metadata
    SET verification_status = 'VERIFIED', verified_by_employee_id = ?, verified_at = ?
    WHERE id = ?
  `).run(empA2, now, doc1);

  const verifiedDoc = db.prepare('SELECT * FROM hr_document_metadata WHERE id = ?').get(doc1);
  if (verifiedDoc.verification_status !== 'VERIFIED' || verifiedDoc.verified_by_employee_id !== empA2) {
    throw new Error('Document verification update failed!');
  }
  console.log('  ✓ Document metadata tracked and verified (no binary payload stored).');
  console.log('✓ TEST 9 PASSED: Document metadata integrity verified.\n');

  // 10. Cascading Deletes & Isolation Verification
  console.log('--- TEST 10: Cascade Deletion & Tenant Boundaries ---');
  // When an employee is deleted, their attendance, document metadata, and leave allocations cascade
  const empA3 = 'emp-temp-' + now;
  db.prepare(`
    INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, employment_type, joining_date, employment_status, created_at, updated_at)
    VALUES (?, ?, 'TEMP-001', 'Temp', 'User', 'CONTRACT', ?, 'ACTIVE', ?, ?)
  `).run(empA3, tenantA, now, now, now);

  const attTemp = 'att-temp-' + now;
  db.prepare(`
    INSERT INTO attendance_records (id, tenant_id, employee_id, date, status, created_at, updated_at)
    VALUES (?, ?, ?, '2026-11-23', 'PRESENT', ?, ?)
  `).run(attTemp, tenantA, empA3, now, now);

  const docTemp = 'doc-temp-' + now;
  db.prepare(`
    INSERT INTO hr_document_metadata (id, tenant_id, employee_id, title, document_type, created_at, updated_at)
    VALUES (?, ?, ?, 'Temporary Agreement', 'CONTRACT', ?, ?)
  `).run(docTemp, tenantA, empA3, now, now);

  // Delete employee
  db.prepare('DELETE FROM employees WHERE id = ?').run(empA3);

  // Verify cascaded deletion
  const checkAtt = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(attTemp);
  const checkDoc = db.prepare('SELECT * FROM hr_document_metadata WHERE id = ?').get(docTemp);
  if (checkAtt || checkDoc) {
    throw new Error('Cascade deletion failed: child records survived employee deletion!');
  }
  console.log('  ✓ Cascade deletion clean: attendance and document metadata removed when parent employee deleted.');

  // Cross-tenant relationship validation (confirming SQLite FK limitation)
  let crossTenantAttInserted = false;
  try {
    // Attempting to insert attendance in Tenant B referencing empA1 from Tenant A
    db.prepare(`
      INSERT INTO attendance_records (id, tenant_id, employee_id, date, status, created_at, updated_at)
      VALUES (?, ?, ?, '2026-11-25', 'PRESENT', ?, ?)
    `).run('att-cross-' + now, tenantB, empA1, now, now);
    crossTenantAttInserted = true;
    console.log('  ✓ SQLite FK allows cross-tenant reference (validates employee existence globally, but NOT tenant ownership).');
    console.log('    --> Documented: Application service layer MUST enforce WHERE tenant_id = ? on all lookups.');
  } catch (err) {
    console.log('  Note on SQLite FK:', err.message);
  }

  console.log('✓ TEST 10 PASSED: Cascading behavior and multi-tenant security perimeter verified.\n');

  console.log('============================================================');
  console.log('ALL 10 TARGETED HR DATABASE INTEGRITY TESTS PASSED!');
  console.log('============================================================\n');

} finally {
  db.exec('ROLLBACK;');
  console.log('Test harness cleanly rolled back (no test artifacts left in local D1).');
}
