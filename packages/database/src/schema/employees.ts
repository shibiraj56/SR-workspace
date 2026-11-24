import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tenants } from './tenants';
import { organisations, branches } from './organisations';
import { departments } from './departments';
import { users } from './users';

export const employees = sqliteTable(
  'employees',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    organisationId: text('organisation_id')
      .references(() => organisations.id, { onDelete: 'set null' }),
    branchId: text('branch_id')
      .references(() => branches.id, { onDelete: 'set null' }),
    employeeCode: text('employee_code').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    workEmail: text('work_email'),
    personalEmail: text('personal_email'),
    phone: text('phone'),
    jobTitle: text('job_title'),
    departmentId: text('department_id')
      .references(() => departments.id, { onDelete: 'set null' }),
    managerEmployeeId: text('manager_employee_id'),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'set null' }),
    employmentType: text('employment_type', {
      enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'],
    })
      .notNull()
      .default('FULL_TIME'),
    joiningDate: integer('joining_date', { mode: 'timestamp' }).notNull(),
    employmentStatus: text('employment_status', {
      enum: ['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED'],
    })
      .notNull()
      .default('ACTIVE'),
    profileImageUrl: text('profile_image_url'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdx: index('employees_tenant_idx').on(table.tenantId),
    tenantCodeUnique: uniqueIndex('employees_tenant_code_unique').on(table.tenantId, table.employeeCode),
    departmentIdx: index('employees_department_idx').on(table.departmentId),
    managerIdx: index('employees_manager_idx').on(table.managerEmployeeId),
    userIdx: index('employees_user_idx').on(table.userId),
    statusIdx: index('employees_status_idx').on(table.employmentStatus),
    workEmailIdx: index('employees_work_email_idx').on(table.workEmail),
  })
);
