import { describe, it, expect, beforeEach } from 'vitest';
import { createTestD1Database } from './mock-d1';
import type { D1Database } from '@cloudflare/workers-types';

describe('Milestone 7 Phase B: HR Database Schema & Integrity Tests', () => {
  let db: D1Database;

  beforeEach(() => {
    db = createTestD1Database();
  });

  it('1. should verify existence of all 15 HR & Workforce Management tables', async () => {
    const expectedTables = [
      'shifts',
      'employee_shifts',
      'holidays',
      'attendance_records',
      'attendance_regularizations',
      'leave_types',
      'leave_allocations',
      'leave_requests',
      'performance_cycles',
      'performance_reviews',
      'hr_onboarding_tasks',
      'hr_lifecycle_events',
      'hr_resignations',
      'hr_exit_checklists',
      'hr_document_metadata',
    ];

    const result = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all<{ name: string }>();
    const tableNames = new Set(result.results.map((r) => r.name));

    for (const table of expectedTables) {
      expect(tableNames.has(table), `Table ${table} should exist`).toBe(true);
    }
  });

  it('2. should enforce unique composite constraint on daily attendance (tenantId, employeeId, date)', async () => {
    const now = Date.now();
    const tenantId = 't-att-1';
    const empId = 'e-att-1';
    const date = '2026-11-24';

    // Seed tenant and employee
    await db
      .prepare("INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, 'T1', 't1', 'ACTIVE', ?, ?)")
      .bind(tenantId, now, now)
      .run();

    await db
      .prepare(`INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, employment_type, joining_date, employment_status, created_at, updated_at)
        VALUES (?, ?, 'EMP001', 'Alice', 'Smith', 'FULL_TIME', ?, 'ACTIVE', ?, ?)`)
      .bind(empId, tenantId, now, now, now)
      .run();

    // Insert first attendance record
    await db
      .prepare(`INSERT INTO attendance_records (id, tenant_id, employee_id, date, status, created_at, updated_at)
        VALUES ('att-1', ?, ?, ?, 'PRESENT', ?, ?)`)
      .bind(tenantId, empId, date, now, now)
      .run();

    // Attempting duplicate attendance record for same employee and date should fail
    await expect(
      db
        .prepare(`INSERT INTO attendance_records (id, tenant_id, employee_id, date, status, created_at, updated_at)
          VALUES ('att-2', ?, ?, ?, 'LATE', ?, ?)`)
        .bind(tenantId, empId, date, now, now)
        .run()
    ).rejects.toThrow();
  });

  it('3. should enforce unique shift code per tenant while permitting same code across tenants', async () => {
    const now = Date.now();
    const tA = 't-shift-a';
    const tB = 't-shift-b';

    await db.prepare("INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, 'TA', 'ta', 'ACTIVE', ?, ?)").bind(tA, now, now).run();
    await db.prepare("INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, 'TB', 'tb', 'ACTIVE', ?, ?)").bind(tB, now, now).run();

    // Insert GEN shift in Tenant A
    await db
      .prepare("INSERT INTO shifts (id, tenant_id, code, name, start_time, end_time, created_at, updated_at) VALUES ('s-a1', ?, 'GEN', 'General', '09:00', '18:00', ?, ?)")
      .bind(tA, now, now)
      .run();

    // Duplicate in Tenant A should fail
    await expect(
      db
        .prepare("INSERT INTO shifts (id, tenant_id, code, name, start_time, end_time, created_at, updated_at) VALUES ('s-a2', ?, 'GEN', 'General 2', '09:00', '18:00', ?, ?)")
        .bind(tA, now, now)
        .run()
    ).rejects.toThrow();

    // Same code in Tenant B should succeed
    const resB = await db
      .prepare("INSERT INTO shifts (id, tenant_id, code, name, start_time, end_time, created_at, updated_at) VALUES ('s-b1', ?, 'GEN', 'General B', '09:00', '18:00', ?, ?)")
      .bind(tB, now, now)
      .run();
    expect(resB.success).toBe(true);
  });

  it('4. should enforce unique leave allocation per employee, leave type and year', async () => {
    const now = Date.now();
    const tId = 't-leave-1';
    const empId = 'e-leave-1';
    const ltId = 'lt-leave-1';

    await db.prepare("INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, 'TL', 'tl', 'ACTIVE', ?, ?)").bind(tId, now, now).run();
    await db.prepare(`INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, employment_type, joining_date, employment_status, created_at, updated_at)
      VALUES (?, ?, 'EMP002', 'Bob', 'Jones', 'FULL_TIME', ?, 'ACTIVE', ?, ?)`).bind(empId, tId, now, now, now).run();
    await db.prepare("INSERT INTO leave_types (id, tenant_id, code, name, default_days_per_year, created_at, updated_at) VALUES (?, ?, 'CASUAL', 'Casual', 12, ?, ?)").bind(ltId, tId, now, now).run();

    // First allocation for 2026
    await db
      .prepare("INSERT INTO leave_allocations (id, tenant_id, employee_id, leave_type_id, year, allocated_days, created_at, updated_at) VALUES ('la-1', ?, ?, ?, 2026, 12.0, ?, ?)")
      .bind(tId, empId, ltId, now, now)
      .run();

    // Duplicate allocation for same year should throw
    await expect(
      db
        .prepare("INSERT INTO leave_allocations (id, tenant_id, employee_id, leave_type_id, year, allocated_days, created_at, updated_at) VALUES ('la-2', ?, ?, ?, 2026, 6.0, ?, ?)")
        .bind(tId, empId, ltId, now, now)
        .run()
    ).rejects.toThrow();
  });

  it('5. should enforce unique performance review per employee and cycle', async () => {
    const now = Date.now();
    const tId = 't-perf-1';
    const empId = 'e-perf-1';
    const cycleId = 'pc-perf-1';

    await db.prepare("INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, 'TP', 'tp', 'ACTIVE', ?, ?)").bind(tId, now, now).run();
    await db.prepare(`INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, employment_type, joining_date, employment_status, created_at, updated_at)
      VALUES (?, ?, 'EMP003', 'Eve', 'Adams', 'FULL_TIME', ?, 'ACTIVE', ?, ?)`).bind(empId, tId, now, now, now).run();
    await db.prepare("INSERT INTO performance_cycles (id, tenant_id, code, name, start_date, end_date, created_at, updated_at) VALUES (?, ?, '2026-Q4', 'Q4 2026', '2026-10-01', '2026-12-31', ?, ?)").bind(cycleId, tId, now, now).run();

    // First review in cycle
    await db
      .prepare("INSERT INTO performance_reviews (id, tenant_id, cycle_id, employee_id, status, created_at, updated_at) VALUES ('pr-1', ?, ?, ?, 'PENDING_SELF_REVIEW', ?, ?)")
      .bind(tId, cycleId, empId, now, now)
      .run();

    // Duplicate review in same cycle should fail
    await expect(
      db
        .prepare("INSERT INTO performance_reviews (id, tenant_id, cycle_id, employee_id, status, created_at, updated_at) VALUES ('pr-2', ?, ?, ?, 'PENDING_SELF_REVIEW', ?, ?)")
        .bind(tId, cycleId, empId, now, now)
        .run()
    ).rejects.toThrow();
  });

  it('6. should cascade delete child HR records upon employee deletion', async () => {
    const now = Date.now();
    const tId = 't-casc-1';
    const empId = 'e-casc-1';

    await db.prepare("INSERT INTO tenants (id, name, slug, status, created_at, updated_at) VALUES (?, 'TC', 'tc', 'ACTIVE', ?, ?)").bind(tId, now, now).run();
    await db.prepare(`INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, employment_type, joining_date, employment_status, created_at, updated_at)
      VALUES (?, ?, 'EMP004', 'Dan', 'Miller', 'FULL_TIME', ?, 'ACTIVE', ?, ?)`).bind(empId, tId, now, now, now).run();

    await db.prepare("INSERT INTO attendance_records (id, tenant_id, employee_id, date, status, created_at, updated_at) VALUES ('att-c1', ?, ?, '2026-11-20', 'PRESENT', ?, ?)").bind(tId, empId, now, now).run();
    await db.prepare("INSERT INTO hr_document_metadata (id, tenant_id, employee_id, title, document_type, created_at, updated_at) VALUES ('doc-c1', ?, ?, 'Pass', 'PASSPORT', ?, ?)").bind(tId, empId, now, now).run();

    // Delete employee
    await db.prepare('DELETE FROM employees WHERE id = ?').bind(empId).run();

    // Verify cascade
    const attRow = await db.prepare('SELECT * FROM attendance_records WHERE id = ?').bind('att-c1').first();
    const docRow = await db.prepare('SELECT * FROM hr_document_metadata WHERE id = ?').bind('doc-c1').first();

    expect(attRow).toBeNull();
    expect(docRow).toBeNull();
  });
});
